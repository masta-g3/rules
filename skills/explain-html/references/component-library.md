# Component Library

Copy these slide sections into `assets/explain-deck-template.html` by replacing `{{SLIDES}}`. Keep each section focused on one idea. Replace inline placeholder text and hard-code flow numbers as `01`, `02`, etc.

## Title

```html
<section class="slide" aria-labelledby="title">
  <div class="slide__inner">
    <p class="kicker">Technical Overview</p>
    <h1 id="title">{{Subject}}</h1>
    <p class="lead">{{One-sentence scope statement: what this explains and who it is for.}}</p>
  </div>
</section>
```

## Proposal Canvas

Use this as the default one-slide shape for team discussion.

```html
<section class="slide" aria-labelledby="proposal">
  <div class="slide__inner wide">
    <p class="kicker">Technical Proposal</p>
    <h1 id="proposal">{{Clear technical subject}}</h1>
    <p class="lead">{{Main proposal or explanation in one sentence.}}</p>
    <div class="grid two">
      <div>
        <svg class="diagram" viewBox="0 0 640 320" role="img" aria-labelledby="diagram-title diagram-desc">
          <title id="diagram-title">{{Diagram title}}</title>
              <desc id="diagram-desc">{{Brief accessible description of the diagram.}}</desc>
          <!-- Draw the smallest useful system shape. For boxed labels, prefer:
          <foreignObject x="40" y="40" width="140" height="56"><div class="svg-label">{{Label}}</div></foreignObject>
          so long labels wrap instead of overflowing. -->
        </svg>
      </div>
      <article class="panel">
        <h3>Discussion points</h3>
        <ul class="takeaways">
          <li>{{Tradeoff, implication, or question.}}</li>
          <li>{{Tradeoff, implication, or question.}}</li>
          <li>{{Tradeoff, implication, or question.}}</li>
        </ul>
      </article>
    </div>
  </div>
</section>
```

## Concept

```html
<section class="slide" aria-labelledby="concept">
  <div class="slide__inner">
    <p class="kicker">Concept</p>
    <h2 id="concept">{{What it is}}</h2>
    <p class="lead">{{The core definition in plain terms.}}</p>
    <p>{{Why it exists or the problem it solves.}}</p>
  </div>
</section>
```

## Flow

```html
<section class="slide" aria-labelledby="flow">
  <div class="slide__inner wide">
    <p class="kicker">Flow</p>
    <h2 id="flow">{{Process name}}</h2>
    <ol class="flow-list">
      <li><span class="num">01</span><span><strong>{{Step name}}</strong><br>{{What happens here.}}</span></li>
      <li><span class="num">02</span><span><strong>{{Step name}}</strong><br>{{What happens here.}}</span></li>
      <li><span class="num">03</span><span><strong>{{Step name}}</strong><br>{{What happens here.}}</span></li>
    </ol>
  </div>
</section>
```

## SVG Diagram

```html
<section class="slide" aria-labelledby="diagram">
  <div class="slide__inner wide">
    <p class="kicker">System shape</p>
    <h2 id="diagram">{{Diagram subject}}</h2>
    <svg class="diagram" viewBox="0 0 960 420" role="img" aria-labelledby="diagram-title diagram-desc">
      <title id="diagram-title">{{Diagram title}}</title>
      <desc id="diagram-desc">{{Accessible description of nodes and relationships.}}</desc>
      <!-- Use currentColor, var(--accent), var(--line), var(--raise), and var(--muted).
      For node labels, prefer <foreignObject><div class="svg-label">...</div></foreignObject>
      or explicit multi-line <tspan> labels. Do not assume long labels fit in one SVG text line. -->
    </svg>
    <p class="note">{{One sentence explaining what to notice.}}</p>
  </div>
</section>
```

## Compare

```html
<section class="slide" aria-labelledby="compare">
  <div class="slide__inner wide">
    <p class="kicker">Before → After</p>
    <h2 id="compare">{{What changed}}</h2>
    <div class="grid two">
      <article class="panel">
        <p class="kicker muted">Before</p>
        <p>{{Prior state or problem.}}</p>
      </article>
      <article class="panel panel--accent">
        <p class="kicker">After</p>
        <p>{{New state or improvement.}}</p>
      </article>
    </div>
  </div>
</section>
```

## Component Cards

```html
<section class="slide" aria-labelledby="parts">
  <div class="slide__inner wide">
    <p class="kicker">Anatomy</p>
    <h2 id="parts">{{Main parts}}</h2>
    <div class="grid three">
      <article class="panel"><h3>{{Part}}</h3><p>{{Responsibility.}}</p></article>
      <article class="panel"><h3>{{Part}}</h3><p>{{Responsibility.}}</p></article>
      <article class="panel"><h3>{{Part}}</h3><p>{{Responsibility.}}</p></article>
    </div>
  </div>
</section>
```

## Key/Value Specs

```html
<section class="slide" aria-labelledby="specs">
  <div class="slide__inner">
    <p class="kicker">At a glance</p>
    <h2 id="specs">{{Specs}}</h2>
    <dl class="spec-list">
      <dt>{{Key}}</dt><dd>{{Value}}</dd>
      <dt>{{Key}}</dt><dd>{{Value}}</dd>
      <dt>{{Key}}</dt><dd>{{Value}}</dd>
    </dl>
  </div>
</section>
```

## Annotated Code

```html
<section class="slide" aria-labelledby="code">
  <div class="slide__inner wide">
    <p class="kicker">Implementation detail</p>
    <h2 id="code">{{What this code shows}}</h2>
    <pre><code>{{escaped code}}</code></pre>
    <p class="note">{{One-line annotation: the key line and why it matters.}}</p>
  </div>
</section>
```

## Callout

```html
<section class="slide" aria-labelledby="callout">
  <div class="slide__inner">
    <div class="callout">
      <p class="kicker">Key point</p>
      <h2 id="callout">{{The one thing to remember.}}</h2>
    </div>
  </div>
</section>
```

## Takeaways

```html
<section class="slide" aria-labelledby="takeaways">
  <div class="slide__inner">
    <p class="kicker">Summary</p>
    <h2 id="takeaways">Takeaways</h2>
    <ul class="takeaways">
      <li>{{Point one.}}</li>
      <li>{{Point two.}}</li>
      <li>{{Point three.}}</li>
    </ul>
  </div>
</section>
```
