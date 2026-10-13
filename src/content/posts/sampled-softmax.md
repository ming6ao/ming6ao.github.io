---
title: "Sampled Softmax: Approximating the Training Loss over a Vocabulary Subset"
author: Ming6ao
pubDatetime: 2026-10-10T20:30:00-07:00
status: published
description: "How the modded-nanogpt speedrun replaces the full-vocabulary training softmax with a small subset, and why the gradient error stays bounded."
---

The language-model head (LM head) scores every word in the vocabulary, so sampled softmax computes the loss over a small subset instead, as in [modded-nanogpt](https://github.com/KellerJordan/modded-nanogpt)'s [sampled_softmax.py](https://github.com/KellerJordan/modded-nanogpt/blob/master/track_1_short/sampled_softmax.py) and [sampled_cross_entropy.py](https://github.com/KellerJordan/modded-nanogpt/blob/master/track_1_short/perf/kernels/sampled_cross_entropy.py). This post derives the gradient error and argues that the saving shrinks as a model grows, because the LM head shrinks as a share of the work.

## The LM head and its cost

A transformer turns each token into a hidden vector. The LM head turns each hidden vector into a probability for every word in the vocabulary. It has one weight matrix $W$ of shape $[V, D]$, where $V$ is the vocabulary size and $D$ is the hidden size. A training step processes many tokens at once; collect their hidden vectors into a matrix $x$ of shape $[T, D]$, where $T$ is the number of tokens in the step. Let $g$ be the gradient of the loss with respect to the scores, of shape $[T, V]$.

The LM head must do three jobs.

**1. Predict.** Turn each hidden vector into one score per vocabulary word. This is the forward prediction:

$$
\text{logits} = x W^\top, \qquad [T, D] \cdot [D, V] \rightarrow [T, V]
$$

**2. Measure the error.** Compare the scores with the correct answers to get the cross-entropy loss. The loss contains a softmax over the vocabulary:

$$
p_j = \frac{\exp(z_j)}{\sum_{k=1}^{V} \exp(z_k)}, \qquad \ell = -\log p_y
$$

Here $z_j$ is the score of word $j$, and $y$ is the correct next word. This job is not a matrix multiply.

**3. Learn.** Send the error backward into the hidden state and into the head weights. This is the backward pass:

$$
\text{grad}_x = g W, \qquad [T, V] \cdot [V, D] \rightarrow [T, D]
$$

$$
\text{grad}_W = x^\top g, \qquad [D, T] \cdot [T, V] \rightarrow [D, V]
$$

Two intermediate arrays of shape $[T, V]$ dominate the cost: `logits`, the output of the forward prediction, and `grad_logits`, its gradient. Each array holds $T \times V$ entries, and both $T$ and $V$ are large. The weight $W$ and the hidden state $x$ are much smaller, because $D$ is much smaller than $V$.

A kernel is compute bound when arithmetic limits it, and memory bound when data movement limits it. The roofline model decides which:

$$
I = \frac{\text{FLOPs}}{\text{bytes}}, \qquad B = \frac{\text{peak FLOP/s}}{\text{bandwidth}}
$$

If $I > B$, the kernel is compute bound; if $I < B$, it is memory bound. The logit multiply is compute bound, because its output is large but its two inputs are small, and the whole LM head is compute bound as well. The operation count is proportional to $V$, so a smaller candidate set reduces the work. That is the opening for the technique below.

## The idea: normalize over a subset of the vocabulary

The softmax turns one row of logits into a probability distribution over the vocabulary. For one token, let $z$ be its row of logits. Here $j$ is the index of one word, $z_j$ is its logit, and $k$ runs over every word in the vocabulary.

$$
\text{softmax}(z)_j = \frac{\exp(z_j)}{\sum_{k=1}^{V} \exp(z_k)}
$$

The numerator scores word $j$. The denominator sums the scores of every word, so the probabilities add to one. Early in training the model has no useful opinion about most of the vocabulary, so the exact normalizer buys resolution the model cannot use yet. Replace the sum over the whole vocabulary with a sum over a candidate set $C$ of size $P$:

$$
\text{softmax}_C(z)_j = \frac{\exp(z_j)}{\sum_{k \in C} \exp(z_k)}
$$

The forward becomes

$$
\text{logits} = x W_C^\top, \qquad [T, D] \cdot [D, P] \rightarrow [T, P]
$$

where $W_C$ holds the rows of $W$ for the words in $C$. Every multiply and every pass now shrinks by the factor $V / P$. The technique is a training device only. Evaluation still uses the full vocabulary.

## Why the subset still trains the model

For one token, the cross-entropy loss is

$$
\ell = -\log p_y
$$

where $y$ is the correct next word and $p_y$ is its probability. The gradient of the loss with respect to each logit is

$$
\frac{\partial \ell}{\partial z_j} = p_j - y_j
$$

The gradient has two parts, and each part acts on one group of words.

- **$p_j$ pushes other words down.** For every word except the target, $y_j = 0$, so the gradient is $p_j$, which is positive. Gradient descent subtracts the gradient, so the logit of word $j$ falls by $p_j$. A word the model thinks is likely has a large $p_j$ and falls far.
- **$y_j$ pulls the target up.** The indicator $y_j$ is 1 for the target and 0 elsewhere. At the target, the gradient is $p_y - 1$, which is negative, so the logit rises.

At every step the model pulls the correct word up and pushes all other words down. The push-down amounts sum to $1 - p_y$, which is the probability mass on the wrong words.

The candidate set changes only the push-down terms. The push-up term acts on one word, and that word is always in $C$ by construction, so the learning signal for the correct answer is never approximated. Inside $C$ the probabilities renormalize:

$$
\tilde{p}_j = \frac{\exp(z_j)}{\sum_{k \in C} \exp(z_k)}
$$

Now bound the error. Write the full probability as

$$
p_j = \frac{\exp(z_j)}{Z}, \qquad Z = \sum_{k=1}^{V} \exp(z_k).
$$

The candidate set $C$ holds the fraction $r_C$ of that normalizer:

$$
r_C = \sum_{j \in C} p_j = \frac{\sum_{j \in C} \exp(z_j)}{Z}.
$$

The restricted softmax normalizes by the candidate sum $\sum_{k \in C} \exp(z_k)$. That sum is the fraction $r_C$ of the full normalizer $Z$, so the restricted probability is the full probability divided by $r_C$:

$$
\tilde{p}_j = \frac{p_j}{r_C}.
$$

Because $r_C$ is below one, dividing by it makes every candidate probability larger. The restricted gradient therefore differs from the full gradient in two places.

- **Inside the set, the push-down is too large.** The restricted push-down is $\tilde{p}_j$ and the full push-down is $p_j$, so the restricted term is larger by the factor $1 / r_C$. The total excess is

  $$
  \sum_{j \in C} \left( \tilde{p}_j - p_j \right)
  = \sum_{j \in C} p_j \left( \frac{1 - r_C}{r_C} \right)
  = 1 - r_C.
  $$

- **Outside the set, the push-down is missing.** The restricted gradient has no term for those words, so the whole missing mass shows up as error:

  $$
  \sum_{j \notin C} p_j = 1 - r_C.
  $$

The two mistakes have the same size, so the $L_1$ norm of the gradient difference is their sum:

$$
\left\| \nabla_z \ell_C - \nabla_z \ell \right\|_1
= (1 - r_C) + (1 - r_C)
= 2(1 - r_C)
$$

The size of the training-gradient mistake is exactly twice the probability mass the model puts outside the candidate set. If the model puts 99% of its mass on the candidates, the error is 0.02.

## The model and its candidate set

Now apply the analysis to a real model. [modded-nanogpt](https://github.com/KellerJordan/modded-nanogpt) is a public speedrun for language-model training. Each entry trains a small transformer on the same dataset (FineWeb10B) to the same target. The target is a mean validation cross-entropy of at most 3.28, and the score is the wall-clock training time on 8 H100 GPUs. This post describes one mechanism from [record #92](https://github.com/KellerJordan/modded-nanogpt/pull/360), which reaches the target in about 40 seconds.

The model is a decoder-only transformer of the GPT-2 class, called 124M, with 11 layers, hidden size 768, and a vocabulary of 50,304. Matrix-multiply work is proportional to parameter count. The LM head holds $768 \times 50{,}304 = 38.6$ million parameters, and the transformer blocks hold about 78 million, so the LM head is roughly a third of the matrix-multiply work in a training step.

The largest training stage processes $T = 49{,}152$ tokens per GPU. On an H100 80 GB with dense FP8 tensor cores, the balance point $B$ is about 591 operations per byte, and the logit multiply is compute bound by a wide margin.

The record builds the candidate set with four choices. Every token in the GPU's batch shares one set $C$, which keeps the operation a single narrow matmul. The set starts with the union of every target in the batch, so the signal for the correct answer is never approximated. The remaining slots come from the sequence $0, s, 2s, \dots \bmod V$ with $s = 20{,}011$. This stride shares no factor with the vocabulary size, so it visits every word before it repeats, and it needs no random number generator. The count then grows with training, from 10,240 candidates at the start to 24,576 near the end. The last 87 steps run the full softmax, so the final weights see the exact gradient.

## Does it scale to large models?

The technique removes work that is proportional to the vocabulary size. Whether that matters depends on how large a share of the model the LM head is. For a transformer with $L$ layers and hidden size $D$, the blocks hold about $12 L D^2$ parameters, and the LM head holds $D V$. So the LM head is this fraction of the matrix-multiply work:

$$
\frac{D V}{D V + 12 L D^2} = \frac{V}{V + 12 L D}
$$

The $12 L D^2$ estimate is the standard non-embedding count from [Kaplan et al.](https://arxiv.org/abs/2001.08361). It assumes multi-head attention with four $D \times D$ projections and a dense MLP of width $4D$. A gated MLP, grouped-query attention, or a mixture-of-experts model changes the count.

The vocabulary is roughly fixed as models grow, while the depth $L$ and the width $D$ both grow. So the fraction falls quickly. The rows below use the dimensions of real open-weight models.

| Model              | Layers $L$ |     LM head $D \times V$ | Share of matmul work |
| ------------------ | ---------: | -----------------------: | -------------------: |
| 124M (this record) |         11 |    768 × 50,304 = 38.6 M |                  33% |
| Llama 3.2 1B       |         16 |  2,048 × 128,256 = 263 M |                  25% |
| Llama 3.1 8B       |         32 |  4,096 × 128,256 = 525 M |                 7.5% |
| Qwen2.5-32B        |         64 |  5,120 × 152,064 = 779 M |                 3.7% |
| Llama 3.1 70B      |         80 | 8,192 × 128,256 = 1.05 B |                 1.6% |

The saving from sampling is bounded by this share. It is about a third for the model in this post, and under 2% for Llama 3.1 70B. A step runs at the speed of the slowest device. Sharding the LM head by the same degree as the blocks keeps the per-device share equal to the global share.

One case keeps the LM head large: a mixture-of-experts model. The LM head is not routed, so every token passes through all of its parameters. Its share follows the parameters that run for a token, not the total.

[Qwen3-30B-A3B](https://huggingface.co/Qwen/Qwen3-30B-A3B) has 30.5 billion total parameters but only 3.3 billion active parameters. Its LM head holds $2048 \times 151{,}936 \approx 311$ million parameters. That is about 1% of the total but about 9% of the active set. [gpt-oss-120b](https://huggingface.co/openai/gpt-oss-120b) shows the same effect. It has 117 billion total parameters and 5.1 billion active parameters, with an LM head of $2880 \times 201{,}088 \approx 579$ million. That is about 0.5% of the total but about 11% of the active set. Against the active set, these models behave like 3 billion and 5 billion dense models.

The saving shrinks as the active parameter count grows. In a dense model, the active count is the whole model. The LM head is the fraction $V / (V + 12 L D)$ of the work, and that fraction falls as the depth and the width grow. In a sparse model, the active count is the part that runs for a token, so the same fraction falls as that part grows. Sampled softmax is a small-model technique, and it pays off when the active compute is small next to a large vocabulary.
