<div align="center">

# Mission Themed Resume Portfolio

The public engine behind **[andrewdicosmo.com](https://andrewdicosmo.com)** — a
mission-briefing style resume site. Clone it, add your own content, and deploy it
with your personal details kept out of public view.

[![Deploy status](https://github.com/andrewdicosmo/andrewdicosmo.com/actions/workflows/azure-swa.yml/badge.svg)](https://github.com/andrewdicosmo/andrewdicosmo.com/actions/workflows/azure-swa.yml)
[![Built with Astro](https://img.shields.io/badge/Astro-4-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Azure Static Web Apps](https://img.shields.io/badge/Azure-Static%20Web%20Apps-0078D4)](https://azure.microsoft.com/products/app-service/static)
[![License: MIT + attribution](https://img.shields.io/badge/License-MIT%20%2B%20attribution-blue)](LICENSE)

**[View the live site](https://andrewdicosmo.com)** ·
[How it deploys](#deployment-architecture) ·
[Run it locally](#run-the-site-locally) ·
[Make it yours](#add-your-own-content)

</div>

---

This is the public website code for [andrewdicosmo.com](https://andrewdicosmo.com).
The code is public so other people can learn from it, copy it, and make their
own version. The personal career details, photo, and private page text are not
stored in this public repository.

## Deployment Architecture

How this site is built, deployed, and how a contact request travels through it.

<p align="center">
  <img src="docs/deployment-architecture.png" alt="Deployment architecture diagram: GitHub Actions builds the public site code together with private content and deploys it to Azure Static Web Apps, while an Azure Function handles contact requests, stores them, and sends the resume by email through SendGrid." width="100%">
</p>

## What Is Included

| | |
| --- | --- |
| **Site engine** | The page layout, styling, and browser behavior. |
| **Sample profile** | A working example profile, so the site runs right after download. |
| **Contact form** | A form and resume delivery function powered by an Azure Function. |
| **Deployment workflow** | A GitHub Actions workflow — GitHub's automated build and deployment process. |

## What Is Private

The real site content lives outside this public repository in a separate private
repository. That private content is copied into the site only when the website is
deployed.

The private content folder is:

```text
src/data/
```

That folder is intentionally ignored by Git, the version control system used by
GitHub. This prevents personal details from being saved in the public code
history.

## Run The Site Locally

You need three tools installed. This project expects Node.js version 22.

- **Node.js** — the JavaScript runtime used to run the project.
- **npm** — the Node Package Manager that installs the project dependencies. It
  comes with Node.js.
- **Git** — the tool that downloads and tracks code from GitHub.

<details>
<summary><b>Mac setup</b></summary>
<br>

1. Install Node.js version 22 from [nodejs.org](https://nodejs.org/).
2. Open the Terminal app.
3. Check that Node.js and npm are installed:

```bash
node -v
npm -v
```

4. Install Git if your Mac asks for it:

```bash
git --version
```

If Git is missing, your Mac may offer to install Apple's command line developer
tools. Accept that prompt.

</details>

<details>
<summary><b>Windows setup</b></summary>
<br>

1. Install Node.js version 22 from [nodejs.org](https://nodejs.org/).
2. Install Git for Windows from [git-scm.com](https://git-scm.com/).
3. Open PowerShell.
4. Check that Node.js, npm, and Git are installed:

```powershell
node -v
npm -v
git --version
```

</details>

Then, in Terminal on Mac or PowerShell on Windows:

```bash
git clone https://github.com/andrewdicosmo/andrewdicosmo.com.git
cd andrewdicosmo.com
npm install
npm run dev
```

Open the local address shown in the terminal. It is usually:

```text
http://localhost:4321
```

On a fresh copy, the site automatically loads the sample content from
`content.example/` into `src/data/` so you can see it working right away.

<details>
<summary><b>Ask ChatGPT or Claude to run it for you</b></summary>
<br>

You can also ask ChatGPT, Claude, or another coding assistant to start the site.
Copy one of these prompts.

Mac prompt:

```text
I am on a Mac. Please help me run this website locally:
https://github.com/andrewdicosmo/andrewdicosmo.com

Check whether Node.js version 22, npm, and Git are installed. If anything is
missing, tell me what to install. Then clone the repository, run npm install,
run npm run dev, and tell me the local website address to open.
```

Windows prompt:

```text
I am on a Windows personal computer. Please help me run this website locally:
https://github.com/andrewdicosmo/andrewdicosmo.com

Use PowerShell. Check whether Node.js version 22, npm, and Git are installed. If
anything is missing, tell me what to install. Then clone the repository, run
npm install, run npm run dev, and tell me the local website address to open.
```

</details>

## Add Your Own Content

Edit the files in `src/data/`:

| File | What it holds |
| --- | --- |
| `profile.json` | Name, headline, links, company information, and repository link. |
| `timeline.json` | Career timeline entries. |
| `sectors.json` | Industry or focus-area labels. |
| `loadout.json` | Capability cards. |
| `brief.json` | Contact form choices and scheduling link. |
| `sections/*.html` | Larger page sections. |
| `assets/subject.webp` | Profile image. |

Files ending in `.json` use JavaScript Object Notation (JSON), a common format
for structured text data. Files ending in `.html` use HyperText Markup Language
(HTML), the standard structure for web pages. Files ending in `.webp` use WebP,
an image format made for websites.

> [!WARNING]
> Do not commit `src/data/` if it contains private information.

## Keep Private Content Out Of The Public Repository

For a public-code and private-content setup:

1. Keep this repository public.
2. Keep your real `src/data/` folder in a separate private GitHub repository.
3. Add these GitHub Actions secrets to the public repository:

| Secret | What it is |
| --- | --- |
| `CONTENT_REPO` | The private repository name, such as `your-name/your-private-content`. |
| `CONTENT_REPO_PAT` | A GitHub Personal Access Token (PAT) — a private key that lets the automated deployment read the private content repository. Give it read-only access. |

When the site deploys, the workflow copies the private content into `src/data/`
for that deployment only.

## Contact Form And Resume Email

The contact form sends information to an Azure Function. An Azure Function is a
small server-side program that runs only when needed.

The function can:

- Save the contact request in Azure Storage.
- Save an uploaded job description file.
- Email a resume as a Portable Document Format (PDF) file.
- Notify the site owner.
- Return a booking link when the request is complete.

These settings are configured in Azure Static Web Apps, not in this repository:

| Setting | Purpose |
| --- | --- |
| `STORAGE_CONNECTION_STRING` | Connects the function to Azure Storage. |
| `LEADS_TABLE` | The table where contact requests are saved. |
| `ATTACH_CONTAINER` | The container for uploaded job description files. |
| `AZURE_COMMUNICATION_CONNECTION_STRING` | Connects to the email service. |
| `EMAIL_SENDER_ADDRESS` | The address the email is sent from. |
| `MAIL_FROM` / `MAIL_TO` | The from and to addresses for notifications. |
| `RESUME_BLOB_URL` | Where the resume PDF is stored. |
| `BOOKINGS_URL` | The booking link returned after a request. |

> [!IMPORTANT]
> Do not put secret values in this repository.

## Build For Deployment

To create the finished static website files:

```bash
npm run build
```

The finished files are written to `dist/`, which is ignored by Git because it is
generated by the build command.

<details>
<summary><b>Useful terms</b></summary>
<br>

| Term | Meaning |
| --- | --- |
| Application Programming Interface (API) | A way for the website to talk to a server-side function. |
| Applicant Tracking System (ATS) | Software companies use to process job applications and resumes. |
| Git | The version control system that tracks file changes over time. |
| GitHub Actions | GitHub's automated build and deployment system. |
| HyperText Markup Language (HTML) | The standard structure for web pages. |
| JavaScript Object Notation (JSON) | A text format for structured data. |
| Personal Access Token (PAT) | A private GitHub key used by automation. |
| Portable Document Format (PDF) | The common file format used for the resume. |
| Static Web App | A website where most files are prebuilt and served directly. |
| Uniform Resource Locator (URL) | A web address. |

</details>

## License

You may use this project under the license in [LICENSE](LICENSE). Keep the
required visible credit link to [andrewdicosmo.com](https://andrewdicosmo.com).
