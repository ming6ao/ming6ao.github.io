---
title: "Sampled Softmax: Approximating the Training Loss over a Vocabulary Subset"
author: Ming6ao
pubDatetime: 2026-10-10T20:30:00-07:00
draft: false
description: "How the modded-nanogpt speedrun replaces the full-vocabulary training softmax with a small subset, and why the gradient error stays bounded."
---

The last layer of a language model turns each hidden vector into a score for every word in the vocabulary. For a model with a large vocabulary, that layer is one of the most expensive parts of training. This post explains a technique that makes it cheaper: for most of training, compute the loss over a small subset of the vocabulary instead of the whole thing.

The technique is called sampled softmax. This post describes the version used in [modded-nanogpt](https://github.com/KellerJordan/modded-nanogpt). The implementation is in `track_1_short/sampled_softmax.py` and `track_1_short/perf/kernels/sampled_cross_entropy.py`.

## Table of contents

## The last layer of a language model

A transformer turns each token into a hidden vector. At the end of the model, one last layer turns each hidden vector into a probability for every word in the vocabulary.

The layer has one weight matrix. Its shape is $[V, D]$:

- $V$ is the vocabulary size, the number of words the model can predict.
- $D$ is the hidden size, the width of the vector for each token.

A training step processes many tokens at once. Collect their hidden vectors into a matrix $x$ of shape $[T, D]$:

- $T$ is the number of tokens the step processes.

The layer must do three jobs.

1. **Predict.** Turn each hidden vector into one score per vocabulary word.
2. **Measure the error.** Compare the scores with the correct answers to get a loss.
3. **Learn.** Send the error backward into the hidden state and into the output weights.

Jobs 1 and 3 are matrix multiplies. Job 2 is the cross-entropy loss, which contains a softmax.

## The three matrix multiplies

Let $W$ be the output weight matrix, shape $[V, D]$. Let $g$ be the gradient of the loss with respect to the scores, shape $[T, V]$.

**Multiply 1, the forward prediction.**

$$
\text{logits} = x W^\top, \qquad [T, D] \cdot [D, V] \rightarrow [T, V]
$$

**Multiply 2, the backward to the hidden state.**

$$
\text{grad}_x = g W, \qquad [T, V] \cdot [V, D] \rightarrow [T, D]
$$

**Multiply 3, the backward to the weights.**

$$
\text{grad}_W = x^\top g, \qquad [D, T] \cdot [T, V] \rightarrow [D, V]
$$

Multiply 1 produces the prediction. Multiply 2 returns the error to the transformer blocks below. Multiply 3 returns the error to the output weights, so the optimizer can update them.

## The two large arrays and the memory passes

Two intermediate arrays dominate the cost. Both have shape $[T, V]$.

- `logits`, the output of Multiply 1.
- `grad_logits`, the gradient of the loss with respect to the logits.

Each array holds $T \times V$ entries. Both $T$ and $V$ are large in a real training run, so each array is measured in gigabytes. The weight $W$ and the hidden state $x$ are much smaller, because $D$ is much smaller than $V$.

The pipeline touches the two arrays several times.

| Pass | Matrix         | Shape  | Operation | Who does it    |
| ---- | -------------- | ------ | --------- | -------------- |
| 1    | `logits`       | [T, V] | write     | Multiply 1.    |
| 2    | `logits`       | [T, V] | read      | Cross-entropy. |
| 3    | `grad_logits`  | [T, V] | write     | Cross-entropy. |
| 4    | `grad_logits`  | [T, V] | read      | Transpose.     |
| 5    | `grad_logitsᵀ` | [V, T] | write     | Transpose.     |
| 6    | `grad_logits`  | [T, V] | read      | Multiply 2.    |
| 7    | `grad_logitsᵀ` | [V, T] | read      | Multiply 3.    |

The count depends on the implementation. Passes 4 and 5 exist for memory layout. The fused matrix multiply needs one operand in a particular layout, so the implementation makes a transposed copy of the gradient. That copy is as large as the gradient itself.

## Compute bound or memory bound?

A kernel is compute bound when arithmetic limits it, and memory bound when data movement limits it. The roofline model decides which:

$$
I = \frac{\text{FLOPs}}{\text{bytes}}, \qquad B = \frac{\text{peak FLOP/s}}{\text{bandwidth}}
$$

If $I > B$, the kernel is compute bound. If $I < B$, it is memory bound.

For the output layer:

- The logit multiply alone is compute bound. Its output is large, but its two inputs are small, so it does many operations per byte.
- The whole block is closer to the boundary. The two arrays are touched several times, so the bytes per operation are higher.
- Both the operation count and the byte count are proportional to $V$. Shrinking the arrays therefore shrinks both sides together.

That last point is the opening for the technique below.

## The idea: normalize over a subset of the vocabulary

The softmax turns one row of logits into a probability distribution over the vocabulary. For one token, let $z$ be its row of logits:

- $j$ is the index of one word.
- $z_j$ is the logit for word $j$, the word whose probability we want.
- $k$ runs over every word in the vocabulary, from $1$ to $V$.
- $z_k$ is the logit for word $k$.

$$
\text{softmax}(z)_j = \frac{\exp(z_j)}{\sum_{k=1}^{V} \exp(z_k)}
$$

The result is the probability of word $j$. The numerator scores word $j$. The denominator sums the scores of every word, so the probabilities across the vocabulary add to one.

Early in training the model has no useful opinion about most of the vocabulary. The exact normalizer buys resolution the model cannot use yet.

So replace the sum over the whole vocabulary with a sum over a candidate set $C$ of size $P$:

$$
\text{softmax}_C(z)_j = \frac{\exp(z_j)}{\sum_{k \in C} \exp(z_k)}
$$

The forward becomes

$$
\text{logits} = x W_C^\top, \qquad [T, D] \cdot [D, P] \rightarrow [T, P]
$$

where $W_C$ holds the rows of $W$ for the words in $C$.

Every multiply and every pass now shrinks by the factor $V / P$. The technique is a training device only. Evaluation still uses the full vocabulary.

## Why the subset still trains the model

For one token, the cross-entropy loss is

$$
\ell = -\log p_{\text{target}}
$$

where $p_{\text{target}}$ is the probability the model gives the correct next word. Training wants the loss small, so it wants that probability close to 1.

The gradient of the loss with respect to each logit is

$$
\frac{\partial \ell}{\partial z_j} = p_j - y_j
$$

The two terms have a simple meaning.

- **$p_j$ is the probability the model gives word $j$.** It is between 0 and 1. Gradient descent subtracts the gradient, so a positive value lowers the logit. This term therefore pushes every word down. A word the model already thinks is likely has a large $p_j$ and is pushed down hard. A word the model thinks is unlikely is pushed down gently.
- **$y_j$ marks the correct word.** It is 1 for the target and 0 for every other word. At the target, the gradient is $p_{\text{target}} - 1$, which is negative, so the target is pushed up.

Put the two together. At every step the model pulls the correct word up and pushes all other words down. The push-down terms sum to one, because the probabilities $p_j$ sum to one across the vocabulary.

The candidate set changes only the push-down terms. The push-up term acts on one word, and that word is always in $C$ by construction. So the learning signal for the correct answer is never approximated.

Inside $C$ the probabilities renormalize:

$$
\tilde{p}_j = \frac{\exp(z_j)}{\sum_{k \in C} \exp(z_k)}
$$

## The gradient-error bound

Define the candidate mass $r_C$ as the total probability the model puts on the candidate set:

$$
r_C = \sum_{j \in C} p_j
$$

Then $\tilde{p}_j = p_j / r_C$. Compare the restricted gradient with the full one.

**Inside the set.** The push-down is inflated by the factor $1 / r_C$:

$$
\sum_{j \in C} \left( \tilde{p}_j - p_j \right)
= \sum_{j \in C} p_j \left( \frac{1 - r_C}{r_C} \right)
= 1 - r_C
$$

**Outside the set.** There is no push-down at all, so the whole missing mass shows up as error:

$$
\sum_{j \notin C} p_j = 1 - r_C
$$

**Total.** The two mistakes have the same size, so the $L_1$ norm of the gradient difference is

$$
\left\| \nabla_z \ell_C - \nabla_z \ell \right\|_1
= (1 - r_C) + (1 - r_C)
= 2(1 - r_C)
$$

The size of the training-gradient mistake is exactly twice the probability mass the model puts outside the candidate set. If the model puts 99% of its mass on the candidates, the error is 0.02. If the model is uniform and $P$ is much smaller than $V$, then $r_C \approx P / V$ is small, and the error approaches 2.

## A worked example

Five words, a candidate set $C = \{A, B, C\}$, and the target is A.

| Word | $p_j$ | In $C$? | $\tilde{p}_j$ | Full gradient | Sampled gradient | Difference |
| ---- | ----: | ------- | ------------: | ------------: | ---------------: | ---------: |
| A    |  0.50 | yes     |         0.625 |        −0.500 |           −0.375 |     +0.125 |
| B    |  0.20 | yes     |         0.250 |        +0.200 |           +0.250 |     +0.050 |
| C    |  0.10 | yes     |         0.125 |        +0.100 |           +0.125 |     +0.025 |
| D    |  0.15 | no      |             — |        +0.150 |                0 |     −0.150 |
| E    |  0.05 | no      |             — |        +0.050 |                0 |     −0.050 |

Here $r_C = 0.8$, so the bound predicts an error of $2 \times 0.2 = 0.4$. The last column sums to $0.4$.

Three things stand out.

1. The target row changed, but the push-up part is identical in both columns. Only the push-down differs.
2. The candidate probabilities were inflated, because they now share a normalizer that sums to 1.00 instead of 0.80.
3. The non-candidate words D and E were never pushed down.

## The model in this record

Now apply the analysis to a real model.

[modded-nanogpt](https://github.com/KellerJordan/modded-nanogpt) is a public speedrun for language-model training. Each entry trains a small transformer on the same dataset (FineWeb10B) to the same target: a mean validation cross-entropy of at most 3.28. The score is the wall-clock training time on 8 H100 GPUs. The data pipeline is fixed, but the architecture, the batch schedule, and the training code are open. This post describes one mechanism from [record #92](https://github.com/KellerJordan/modded-nanogpt/pull/360), which reaches the target in about 40 seconds.

The model is a decoder-only transformer of the GPT-2 class. The record calls it 124M. Its main dimensions are:

| Parameter               | Value                       |
| ----------------------- | --------------------------- |
| Layers                  | 11                          |
| Hidden size             | 768                         |
| Attention heads         | 6                           |
| Vocabulary              | 50,304                      |
| Maximum sequence length | 3,072                       |
| Transformer blocks      | 12 × 11 × 768² ≈ 78 million |
| Output layer            | 768 × 50,304 = 38.6 million |

Matrix-multiply work is proportional to parameter count. The output layer holds $768 \times 50{,}304 = 38.6$ million parameters. The transformer blocks hold $12 \times 11 \times 768^2 \approx 78$ million. The factor 12 comes from the two parts of a standard transformer block:

- **Attention** has four projections of shape $D \times D$, so $4 D^2$ parameters.
- **The MLP** has two matrices with a hidden width of about $4D$, so $8 D^2$ parameters.

Together they give $12 D^2$ per block, and $12 L D^2$ for $L$ blocks. Real models vary the MLP width, so this is an approximation.

So the output layer is roughly a third of the matrix-multiply work in a training step.

The largest training stage processes $T = 49{,}152$ tokens per GPU. With $D = 768$ and $V = 50{,}304$:

- Each of the two arrays holds $49{,}152 \times 50{,}304 = 2.47$ billion entries. At one byte each, that is 2.47 GB per array.
- The hidden state $x$ is 37 MB. The weight $W$ is 39 MB.

The roofline numbers for this model are:

| Quantity             | The logit multiply alone | The whole output block |
| -------------------- | -----------------------: | ---------------------: |
| FLOPs                |      $3.80\times10^{12}$ |    $11.4\times10^{12}$ |
| Bytes moved          |       $2.55\times10^{9}$ |     $17.3\times10^{9}$ |
| Arithmetic intensity |                    1,490 |                    645 |

On an H100 80 GB with dense FP8 tensor cores, the balance point $B$ is about 591 operations per byte. The single multiply is compute bound by a wide margin. The whole block sits almost exactly on the knee. The reason is the seven passes over the big arrays, which move about 17 GB. That byte cost is close to the operation count. Storing both arrays in one byte each is what makes this possible. If the same multiplies ran with two-byte arrays, the block would be memory bound.

## Building the candidate set

The record builds the set with four choices.

**One shared set per batch.** Every token in the GPU's batch uses the same $C$. A set per token would turn a dense matrix multiply into a gather. A shared set keeps the operation a single narrow matmul.

**Every target is in the set.** The build starts with the union of every target in the batch. The most important part of the gradient is never approximated.

**Filler negatives from a fixed stride.** The remaining slots come from the sequence $0, s, 2s, \dots \bmod V$ with $s = 20{,}011$. This stride shares no factor with the vocabulary size. The sequence therefore visits every word before it repeats, so the sweep covers the vocabulary evenly over time. It needs no random number generator, which keeps the run reproducible and the schedule simple.

**Ramp the set up, then finish on the full vocabulary.** As the model sharpens, a fixed candidate set would start to miss real mass. The count grows with training, and the last 87 steps run the full softmax so the final weights see the exact gradient.

| Steps      | Candidates $P$ | Error if uniform | Error bound $2(1-r_C)$ |
| ---------- | -------------: | ---------------: | ---------------------: |
| 0 - 680    |         10,240 |             0.20 |                   1.60 |
| 681 - 964  |         14,336 |             0.28 |                   1.43 |
| 965 - 1106 |         24,576 |             0.49 |                   1.02 |
| 1107 - end |  50,304 (full) |             1.00 |                   0.00 |

## Does it scale to large models?

The technique removes work that is proportional to the vocabulary size. Whether that matters depends on how large a share of the model the output layer is.

For a transformer with $L$ layers and hidden size $D$, the blocks hold about $12 L D^2$ parameters. The output layer holds $D V$. So the output layer is this fraction of the matrix-multiply work:

$$
\frac{D V}{D V + 12 L D^2} = \frac{V}{V + 12 L D}
$$

The vocabulary is roughly fixed as models grow. The depth $L$ and the width $D$ both grow. So the fraction falls quickly.

| Model | Layers $L$ | Output layer $D \times V$ | Share of matmul work |
| ----- | ---------: | ------------------------: | -------------------: |
| 124M  |         11 |     768 × 50,304 = 38.6 M |                  33% |
| 1B    |         24 |    2,048 × 50,304 = 103 M |                   8% |
| 7B    |         32 |   4,096 × 128,256 = 525 M |                 7.5% |
| 40B   |         60 |   6,656 × 128,256 = 854 M |                 2.6% |
| 70B   |         80 |   8,192 × 128,256 = 1.1 B |                 1.6% |

At 40 billion parameters the output layer is about 2.6% of the matrix-multiply work. Even a ten-fold cut of that layer would save about 2% of the step. That is small next to the risk of training the final weights on a biased gradient.

That number is the global share. The per-device share depends on how the model is distributed. The run in this post uses data parallelism: every GPU holds the full output layer and processes its own tokens, so the two shares are the same, and the table applies directly.

At larger scale the model is distributed further. If the output layer is sharded along the same dimension and by the same degree as the blocks, the per-device share still equals the global share. Tensor parallelism does this by splitting the output layer along the vocabulary dimension. Sequence parallelism does it by splitting along the tokens.

The per-device share grows if the output layer is replicated while the blocks are sharded. Let $d$ be the degree to which the blocks' compute is sharded. With the output layer replicated, the per-device share is

$$
\frac{V}{V + 12 L D / d}
$$

For the 40B row above, $d = 8$ raises the share from 2.6% to about 18%. In that configuration the technique would matter much more. But the better fix is to shard the output layer, which removes the redundant work without a biased gradient. Sharding is exact, and it scales with the device count.

Pipeline parallelism is another case. The output layer sits in the last stage, so its share within that stage is higher than the global share. The slowest stage sets the clock.

Two architectural choices also change the picture.

- **A much larger vocabulary.** If $V$ grows to millions of tokens, as in some multilingual or byte-level models, the output layer's share grows with it.
- **A mixture-of-experts model.** The output layer is not routed, so its share is set by the active parameters, not the total. A 40B-total model with 4B active parameters has an output share closer to a 4B dense model.

There is also a memory argument. At long context the logits are $[T, V]$, and $T$ can be large. But that problem has a better solution: compute the softmax and its gradient in fused, vocabulary-chunked pieces, so the logits never leave the chip. That keeps the exact loss. Frontier training uses this approach, with the vocabulary split across devices, and keeps the full softmax.

So the technique scales in the sense that nothing breaks. But its benefit shrinks toward zero. It is a small-model technique, and its natural setting is a model that is small next to a very large vocabulary, which is exactly the speedrun setting of this post.

## Summary

- The output layer of a language model is three matrix multiplies and several passes over a $[T, V]$ logits array and its gradient. The arrays are the dominant cost, because $T$ and $V$ are both large.
- The logit multiply alone is compute bound. The whole block sits near the roofline knee, so shrinking the arrays shrinks the work and the traffic together.
- Replacing $V$ with a candidate count $P$ shrinks the multiplies and the passes by $V / P$.
- The gradient error is exactly $2(1 - r_C)$, twice the probability mass outside the candidate set.
- So the set starts small, grows as the model sharpens, and ends at the full vocabulary. The last 87 steps of this record are exact.
- The saving scales with the output layer's share of the model. That share is about a third at GPT-2 scale, but under 3% at 40 billion parameters. The technique is for small models with large vocabularies.
