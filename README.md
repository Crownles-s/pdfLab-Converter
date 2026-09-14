# pdfLab

Private, browser-only DOCX and PPTX to PDF conversion for the web.

pdfLab is a static site: files are read, parsed, rendered, and converted in the browser. There is no application server, file upload endpoint, database, analytics, or telemetry. It can be deployed directly to Cloudflare Pages or any static host.

## Features

- DOCX to PDF through Mammoth HTML conversion, html2canvas rendering, and jsPDF output.
- PPTX to PDF through JSZip archive reading, fast-xml-parser validation, and browser-rendered slide content.
- Drag-and-drop and file-picker upload.
- Multiple files per queue, with per-file progress and error states.
- Individual PDF downloads or one ZIP download for completed batches.
- Light/dark mode persisted in `localStorage`.
- No file leaves the current browser tab.
- Responsive UI with reduced-motion support.

PPTX fidelity can vary for animations, embedded video, SmartArt, unusual fonts, and other advanced PowerPoint features.

## Project structure

```text
.
├── index.html
├── css/
│   └── styles.css
└── js/
    ├── app.js
    └── vendor/
        ├── fast-xml-parser.min.js
        ├── html2canvas.min.js
        ├── jszip.min.js
        ├── jspdf.umd.min.js
        ├── mammoth.browser.min.js
        └── LICENSES.txt
```

There is no build step and no package manager requirement. The checked-in vendor bundles make the conversion libraries available without npm, a bundler, or a backend.

## Run locally

Opening `index.html` directly works in modern browsers. For the most representative local environment, serve the folder over HTTP:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

If Python is not installed, use any static-file server. No server-side conversion code is required.

## Deploy to Cloudflare Pages

1. Create a repository containing this folder.
2. In Cloudflare Pages, choose **Create a project** and connect the repository.
3. Select the framework preset **None**.
4. Leave the build command empty.
5. Set the output directory to `/` (the repository root).
6. Deploy.

The site is fully static. No environment variables, API keys, service bindings, functions, or database configuration are required.

## Dependencies

All runtime JavaScript dependencies are vendored under `js/vendor/`:

| Library | Version | Purpose | License |
| --- | ---: | --- | --- |
| Mammoth.js | 1.8.0 | DOCX to semantic HTML | BSD-2-Clause |
| html2canvas | 1.4.1 | HTML to canvas rendering | MIT |
| jsPDF | 2.5.1 | PDF generation | MIT |
| JSZip | 3.10.1 | DOCX/PPTX archive reading and ZIP export | MIT or GPL-3.0 |
| fast-xml-parser | 5.2.5 | Office XML validation/parsing support | MIT |

See [`js/vendor/LICENSES.txt`](js/vendor/LICENSES.txt) for project links and license references.

The UI loads Manrope and DM Serif Display from Google Fonts. If the font request is unavailable, the CSS fallback stack keeps the site usable.

## Privacy and security

- Input files are processed with the browser File API.
- No file contents are sent to a server.
- No cookies, analytics, telemetry, or third-party conversion APIs are used.
- The app does not require credentials or secrets.
- Do not commit local test documents, `.env` files, private keys, access tokens, or browser exports.

The GitHub footer link is a public profile link only; it is not used for authentication or application access.

## Browser support

Use a current desktop or mobile version of Chrome, Edge, Firefox, or Safari with support for:

- `File.arrayBuffer()`
- `Blob` and `URL.createObjectURL()`
- `DOMParser`
- Canvas
- `localStorage`

Large documents and image-heavy presentations use more memory because rendering happens locally in the browser.

## Maintenance

When updating a vendored dependency:

1. Replace its file in `js/vendor/`.
2. Update the version and license entry in `js/vendor/LICENSES.txt`.
3. Update the dependency table above.
4. Smoke-test one DOCX, one PPTX, an invalid file, and a multi-file ZIP export.

Keep `index.html`, `css/styles.css`, and `js/app.js` free of credentials and environment-specific paths so the folder remains deployable as-is.
