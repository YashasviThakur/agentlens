# AgentLens demo: real pages

Generated 2026-10-14 against the live pages, using TinyFish Search, Fetch and Agent.

| Page | Score | AI readability | Search position | Reading |
|---|---|---|---|---|
| [todomvc.com/examples/react/dist/](https://todomvc.com/examples/react/dist/) | 57 (D) | 31 | #1 | A client-rendered React app |
| https://react.dev | – | – | – | Could not be audited: fetch failed |
| [www.dtu.ac.in](https://www.dtu.ac.in) | 69 (C) | 56 | n/a | Delhi Technological University |
| [www.tinyfish.ai](https://www.tinyfish.ai) | 97 (A) | 94 | #1 | The sponsor’s own site |
| [news.ycombinator.com](https://news.ycombinator.com) | 67 (C) | 47 | #1 | Plain HTML, almost no metadata |
| https://en.wikipedia.org/wiki/Search_engine_optimization | – | – | – | Could not be audited: fetch failed |

## https://todomvc.com/examples/react/dist/

*A client-rendered React app.* Score **57 (D)**, AI readability **31**, search position **#1** for “TodoMVC: React”.

> You rank #1 for “TodoMVC: React”, but AI tools get little usable from the page (readability 31/100). Search sends people to you; AI answers will skip or misquote you.

Compared with the top results for this query:

- #3 github.com: readability 81, 223 words, JSON-LD no
- #4 demo.playwright.dev: readability 47, 14 words, JSON-LD no
- #7 www.benmccann.com: not fetchable (target_unreachable)
- #8 todo-app.tallinn-learning.ee: readability 31, 4 words, JSON-LD no

What the others do that this page does not:

- 2 of 3 top results for this query serve their main text in the initial HTML. This one does not.
- Their average readability is 53/100 against your 31.
- 1 of the top results for this query could not be fetched by TinyFish (target_unreachable). They are visible in search but not readable to AI fetch tools, which is an opening.

Top fixes:

1. **Structured data (JSON-LD)**: No JSON-LD in the served HTML. Models and search engines lean on it to know what the page is about. Add this to the <head> and refine the @type (Article, Product, SoftwareApplication, FAQPage…) to match the page:
2. **Open Graph tags**: Present: none. Set og:title, og:description and og:image so previews and link unfurlers describe the page correctly. Replace the og:image URL with a real 1200×630 image:
3. **Content is in the raw HTML, not injected by JavaScript**: Only 0% of the page's main text is in the HTML served to crawlers (0 of 46 words). The rest appears only after JavaScript runs, so crawlers that skip JS never see it. Server-render or statically generate the main content (SSR / SSG / prerender) so it ships in the first HTML response.

Agent test did not complete: The operation was aborted due to timeout


## https://www.dtu.ac.in

*Delhi Technological University.* Score **69 (C)**, AI readability **56**, search position **n/a** for “Delhi Technological University”.

> Search visibility could not be checked, so readability is shown on its own.

Top fixes:

1. **Meta description**: No meta description found. Add a description. A draft taken from your opening paragraph; edit it before use:
2. **Structured data (JSON-LD)**: No JSON-LD in the served HTML. Models and search engines lean on it to know what the page is about. Add this to the <head> and refine the @type (Article, Product, SoftwareApplication, FAQPage…) to match the page:
3. **Open Graph tags**: Present: none. Set og:title, og:description and og:image so previews and link unfurlers describe the page correctly. Replace the og:image URL with a real 1200×630 image:

Agent test (3 steps): “The official website of Delhi Technological University (DTU), a premier public technical university located in Delhi, India.” Main action: Browse university information including admissions, notices, jobs, and events..


## https://www.tinyfish.ai

*The sponsor’s own site.* Score **97 (A)**, AI readability **94**, search position **#1** for “TinyFish”.

> Visible and readable: you rank #1 for “TinyFish” and AI tools can use the page. This is the combination AI answers reward.

Compared with the top results for this query:

- #2 www.linkedin.com: not fetchable (not_returned)
- #3 www.reuters.com: not fetchable (not_returned)
- #4 github.com: not fetchable (not_returned)
- #5 www.youtube.com: not fetchable (not_returned)

What the others do that this page does not:

- 4 of the top results for this query could not be fetched by TinyFish (not_returned). They are visible in search but not readable to AI fetch tools, which is an opening.

Top fixes:

1. **Meta description**: 208 characters: "TinyFish provides enterprise infrastructure for AI web agents. Run hundreds of websites simultaneously to navigate, auth…" Add <meta name="description"> of 70–160 characters summarising the page in plain language.

Agent test (3 steps): “TinyFish is a platform that provides web infrastructure and APIs (search, fetch, browser, and agent tools) designed specifically for AI agents to interact with the live web.” Main action: Connect TinyFish.


## https://news.ycombinator.com

*Plain HTML, almost no metadata.* Score **67 (C)**, AI readability **47**, search position **#1** for “Hacker News”.

> You rank #1 for “Hacker News”, but AI tools get little usable from the page (readability 47/100). Search sends people to you; AI answers will skip or misquote you.

Compared with the top results for this query:

- #2 thehackernews.com: readability 94, 157 words, JSON-LD yes
- #3 en.wikipedia.org: readability 83, 737 words, JSON-LD yes
- #4 www.facebook.com: not fetchable (login_required)
- #5 www.reddit.com: readability 31, 754 words, JSON-LD no

What the others do that this page does not:

- 2 of 3 top results for this query publish structured data (JSON-LD). This one does not.
- 2 of 3 top results for this query declare a canonical URL. This one does not.
- 2 of 3 top results for this query use exactly one <h1>. This one does not.
- Their average readability is 69/100 against your 47.
- 1 of the top results for this query could not be fetched by TinyFish (login_required). They are visible in search but not readable to AI fetch tools, which is an opening.

Top fixes:

1. **Meta description**: No meta description found. Add a description. A draft taken from your opening paragraph; edit it before use:
2. **Structured data (JSON-LD)**: No JSON-LD in the served HTML. Models and search engines lean on it to know what the page is about. Add this to the <head> and refine the @type (Article, Product, SoftwareApplication, FAQPage…) to match the page:
3. **Open Graph tags**: Present: none. Set og:title, og:description and og:image so previews and link unfurlers describe the page correctly. Replace the og:image URL with a real 1200×630 image:

Agent test did not complete: The operation was aborted due to timeout

