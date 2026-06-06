---
theme: neversink
layout: cover
title: Sum-Check Protocol
info: |
  Interactive slides for the Sum-Check protocol on multinomial polynomials.

author: Nobutaka Shimizu
mdc: true
css: unocss
style: |
  @import './styles/custom.css';
addons:
  - slidev-addon-rabbit
rabbit:
  slideNum: true
fonts:
  sans: 'Roboto'
  mono: 'Fira Code'
  weights: '400,500,700'
  italic: true
favicon: 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/svgs/solid/book.svg'
themeConfig:
  primary: '#1976d2'

---

# Sum-Check Protocol

<div class="grid grid-cols-2 gap-4 place-items-center h-56">

<div>

[**Nobutaka Shimizu**](https://sites.google.com/view/nobutaka-shimizu/home) (Institute of Science Tokyo)



</div>


</div>

:: note ::
<div class="text-slate-500">
  Sum-Check Protocol — interactive demo
</div>

---
layout: top-title
color: amber-light
---

::title::

# Problem

::content::

<div class="topic-box">

Let $f(x_1,\ldots,x_n)$ be a **multinomial polynomial** over a finite field $\F$.
The prover claims

$$
  H \;=\; \sum_{(b_1,\ldots,b_n)\in\binset^n} f(b_1,\ldots,b_n).
$$

The verifier knows $H$ and can interact with the prover, but cannot evaluate the exponential-size sum directly.

</div>

<v-clicks>

- Goal: verify the claim using **$n$ rounds** of communication
- Each round reduces the number of free variables by one
- Soundness error is at most $n d/\abs{\F}$, where $d$ is the total degree of $f$

</v-clicks>

---
layout: top-title
color: amber-light
---

::title::

# Protocol (Round $i$)

::content::

<div class="definition">

At round $i\in[n]$, the honest prover sends the univariate polynomial

$$
  g_i(X) \;:=\; \sum_{(b_{i+1},\ldots,b_n)\in\binset^{n-i+1}}
  f(r_1,\ldots,r_{i-1}, X, b_{i+1},\ldots,b_n).
$$

The verifier checks $g_i(0)+g_i(1)$ equals the current claim, samples a random $r_i\in\F$, and updates the claim to $g_i(r_i)$.

</div>

<v-clicks>

- After $n$ rounds, the claim becomes $f(r_1,\ldots,r_n)$
- The verifier makes **one oracle query** to the prover at the final point
- If the prover is honest, every check passes with probability $1$

</v-clicks>

---
layout: top-title
color: amber-light
---

::title::

# Example

::content::

<div class="example">

Take $f(x,y)=2xy+x+y+1$ over $\F_7$.

Summing over $\binset^2$ gives $H=10\equiv 3\pmod 7$.

</div>

<v-click>

In round 1, the prover sends $g_1(X)=\sum_{b\in\binset} f(X,b)$.

After the verifier picks $r_1$, round 2 sends $g_2(X)=f(r_1,X)$.

</v-click>

---
layout: top-title
color: amber-light
---

::title::

# Interactive Simulation (Multilinear)

::content::

<SumCheckSimulator />

:: note ::
Use **Next round** to walk through the protocol step by step, or **Run all** to complete every round at once.

---
layout: top-title
color: amber-light
---

::title::

# Exercise: Sum-Check Chat (Multilinear)

::content::

<SumCheckExercise />

:: note ::
Play the **Verifier**: send challenges $r_i$, then **Accept** or **Reject** after the oracle message.
