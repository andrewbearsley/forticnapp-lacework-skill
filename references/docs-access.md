# Fetching the official docs

docs.fortinet.com serves both document text and search results as plain HTML. `curl` reaches
both, so no browser, no JavaScript rendering, and no extra tooling are needed.

Search first, then read only the section you need. This keeps the reading small and works
for every published document.

## 1. Search one document

Append `/search?q=<query>` to the document path:

```bash
curl -sL "https://docs.fortinet.com/document/forticnapp/latest/administration-guide/search?q=alert%20channel" \
  | tr '\n' ' ' \
  | grep -oE '<div class="result-title"><a href="[^"]+">[^<]+' \
  | sed -e 's|.*href="|https://docs.fortinet.com|' -e 's|">| :: |' \
  | awk '!seen[$0]++'
```

Returns ranked section URLs and titles:

```
https://docs.fortinet.com/document/forticnapp/latest/administration-guide/413628/configure-alert-channels :: Configure alert channels
https://docs.fortinet.com/document/forticnapp/latest/administration-guide/8323/email-alert-channel :: Email alert channel
```

URL-encode spaces in the query as `%20`.

## 2. Read a section

Section text is server-rendered inside `div.document-content`. Scope the strip to that element to drop the site navigation. Decode `&amp;` last, so an escaped entity does not decode twice:

```bash
curl -sL "<section-url>" \
  | tr '\n' ' ' \
  | sed -e 's|.*<div class="document-content[^>]*>||' \
        -e 's|<div class="doc-nav.*||' \
        -e 's|<[^>]*>|\n|g' \
        -e 's|&nbsp;| |g' -e 's|&lt;|<|g' -e 's|&gt;|>|g' \
        -e 's|&quot;|"|g' -e "s|&#039;|'|g" -e 's|&amp;|\&|g' \
  | sed -e 's/^ *//' -e 's/ *$//' | grep -v '^$'
```

## 3. List the available documents

The product landing page carries every document path:

```bash
curl -sL https://docs.fortinet.com/product/forticnapp \
  | grep -oE '/document/forticnapp/[^"'"'"' ]*' | sort -u
```

Returns the current document paths, including `/latest/administration-guide`, `/latest/cli-reference`, `/latest/api-reference`, `/latest/lql-reference`, and `/latest/release-notes`. The set changes as Fortinet republishes, so read it rather than assuming a fixed list.

## Whole document as PDF

Most documents also publish a PDF, which suits bulk grep across a full reference. This route needs `pdftotext` (macOS: `brew install poppler`; Debian and Ubuntu: `apt install poppler-utils`). The HTML route above covers the same content without it, so prefer the PDF only when you want the whole document at once.

Extract the S3 URL, then convert:

```bash
URL=$(curl -sL https://docs.fortinet.com/document/forticnapp/latest/cli-reference \
  | grep -oE 'https://fortinetweb\.s3\.amazonaws\.com[^"'"'"' ]*\.pdf' | sort -u | head -1)

curl -sL "$URL" -o cli-ref.pdf
pdftotext -layout cli-ref.pdf cli-ref.txt
grep -niE 'query|policy|alert-rule|cloud-account' cli-ref.txt
```

Keep `sort -u | head -1`: the link appears twice in the page, and the `.pdf` filter matters because the page also embeds many `fortinetweb.s3.amazonaws.com` product icon URLs.

The UUID and, on some documents, the version are part of the URL, and both change when the document is re-published. Re-run the extraction rather than caching the URL. The administration guide is published as HTML only, so use the search and section route for it.
