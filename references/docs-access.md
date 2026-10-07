# Read the official docs

docs.fortinet.com serves document text and search results as plain HTML. `curl` reads both.
You need no browser, no JavaScript rendering, and no extra tools.

Search first. Then read only the section you need. This keeps the reading small. It works for
every published document.

## 1. Search one document

Add `/search?q=<query>` to the document path.

The quickest form is the suggest endpoint. It returns JSON:

```bash
curl -s "https://docs.fortinet.com/document/forticnapp/latest/administration-guide/search/suggest?q=alert%20channel" \
  | jq -r '.[] | "https://docs.fortinet.com\(.href) :: \(.title)"'
```

The full search page is server-rendered HTML. Each result sits in an `es-row-title` heading:

```bash
curl -sL "https://docs.fortinet.com/document/forticnapp/latest/administration-guide/search?q=alert%20channel" \
  | tr '\n' ' ' \
  | grep -oE '<h3 class="es-row-title">\s*<a href="[^"]+">[^<]+' \
  | sed -e 's|.*href="|https://docs.fortinet.com|' -e 's|">| :: |' \
  | awk '!seen[$0]++'
```

Both return ranked section URLs and titles:

```
https://docs.fortinet.com/document/forticnapp/latest/administration-guide/746001/alert-channels :: Alert channels
https://docs.fortinet.com/document/forticnapp/latest/administration-guide/413628/configure-alert-channels :: Configure alert channels
```

URL-encode spaces in the query as `%20`.

The site markup changes between releases. If the grep returns nothing for a query that must have results, fetch the page. Find the class that wraps each result title. Update the pattern to match it.

Suggest matches loosely on title. A policy ID or an exact phrase can return neighbouring pages. Read the page before you quote it.

## 2. Read a section

Section text is server-rendered inside `<article class="reader__page">`. Strip the tags inside that element only. This drops the site navigation. Decode `&amp;` last, so that each escaped entity decodes only once:

```bash
curl -sL "<section-url>" \
  | tr '\n' ' ' \
  | sed -e 's|.*<article class="reader__page"[^>]*>||' \
        -e 's|</article>.*||' \
        -e 's|<[^>]*>|\n|g' \
        -e 's|&nbsp;| |g' -e 's|&lt;|<|g' -e 's|&gt;|>|g' \
        -e 's|&quot;|"|g' -e "s|&#039;|'|g" -e 's|&amp;|\&|g' \
  | sed -e 's/^ *//' -e 's/ *$//' | grep -v '^$'
```

## 3. List the available documents

The product landing page lists every document path:

```bash
curl -sL https://docs.fortinet.com/product/forticnapp \
  | grep -oE '/document/forticnapp/[^"'"'"' ]*' | sort -u
```

The command returns the current document paths. These include `/latest/administration-guide`, `/latest/cli-reference`, `/latest/api-reference`, `/latest/lql-reference`, and `/latest/release-notes`. The set changes when Fortinet republishes. Read the current list each time, in place of a fixed list.

## Whole document as PDF

Fortinet also publishes most documents as a PDF. Use the PDF to grep across a full reference. This route needs `pdftotext`. On macOS, run `brew install poppler`. On Debian and Ubuntu, run `apt install poppler-utils`.

The HTML route above covers the same content without `pdftotext`. Use the PDF only when you want the whole document at once.

Extract the S3 URL. Then download and convert the PDF:

```bash
URL=$(curl -sL https://docs.fortinet.com/document/forticnapp/latest/cli-reference \
  | grep -oE 'https://fortinetweb\.s3\.amazonaws\.com[^"'"'"' ]*\.pdf' | sort -u | head -1)

curl -sL "$URL" -o cli-ref.pdf
pdftotext -layout cli-ref.pdf cli-ref.txt
grep -niE 'query|policy|alert-rule|cloud-account' cli-ref.txt
```

Keep `sort -u | head -1`, because the link appears twice in the page. Keep the `.pdf` filter too, because the page also contains many `fortinetweb.s3.amazonaws.com` product icon URLs.

The URL contains a UUID. On some documents it also contains the version. Both change when Fortinet republishes the document. Run the extraction each time you need the PDF, in place of a cached URL.

Fortinet publishes the administration guide as HTML only. Use the search and section route for it.
