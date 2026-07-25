# Mission Themed Resume Portfolio

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

- The page layout, styling, and browser behavior.
- A sample profile so the site works after download.
- A contact form and resume delivery function.
- A GitHub Actions workflow, which is an automated GitHub build and deployment
  process.

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

## Get Your Computer Ready

Before you can preview the website on your own computer, install these:

- Node.js, the JavaScript runtime used to run the project.
- npm, the Node Package Manager that installs the project dependencies. It is
  included with Node.js.
- Git, the tool that downloads and tracks code from GitHub.

This project currently expects Node.js version 22.

## Mac Setup

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

## Windows Personal Computer (PC) Setup

1. Install Node.js version 22 from [nodejs.org](https://nodejs.org/).
2. Install Git for Windows from [git-scm.com](https://git-scm.com/).
3. Open PowerShell.
4. Check that Node.js, npm, and Git are installed:

```powershell
node -v
npm -v
git --version
```

## Run The Site Locally

1. Open Terminal on Mac, or PowerShell on Windows.
2. Go to the folder where you want to keep the website.
3. Download the repository:

```bash
git clone https://github.com/andrewdicosmo/andrewdicosmo.com.git
```

4. Move into the project folder:

```bash
cd andrewdicosmo.com
```

5. Install the project dependencies:

```bash
npm install
```

6. Start the local website:

```bash
npm run dev
```

7. Open the local address shown in the terminal. It is usually:

```text
http://localhost:4321
```

On a fresh copy, the site automatically loads the sample content from
`content.example/` into `src/data/` so you can see it working right away.

## Ask ChatGPT Or Claude To Run It For You

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

## Add Your Own Content

Edit the files in `src/data/`:

- `profile.json`: name, headline, links, company information, and repository
  link.
- `timeline.json`: career timeline entries.
- `sectors.json`: industry or focus-area labels.
- `loadout.json`: capability cards.
- `brief.json`: contact form choices and scheduling link.
- `sections/*.html`: larger page sections.
- `assets/subject.webp`: profile image.

Files ending in `.json` use JavaScript Object Notation (JSON), a common format
for structured text data. Files ending in `.html` use HyperText Markup Language
(HTML), the standard structure for web pages. Files ending in `.webp` use WebP,
an image format made for websites.

Do not commit `src/data/` if it contains private information.

## Keep Private Content Out Of The Public Repository

For a public-code and private-content setup:

1. Keep this repository public.
2. Keep your real `src/data/` folder in a separate private GitHub repository.
3. Add these GitHub Actions secrets to the public repository:

```text
CONTENT_REPO
CONTENT_REPO_PAT
```

`CONTENT_REPO` is the private repository name, such as
`your-name/your-private-content`.

`CONTENT_REPO_PAT` is a GitHub Personal Access Token (PAT). A Personal Access
Token is a private key that lets the automated deployment read the private
content repository. Give it read-only access to the private content repository.

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

```text
STORAGE_CONNECTION_STRING
LEADS_TABLE
ATTACH_CONTAINER
AZURE_COMMUNICATION_CONNECTION_STRING
EMAIL_SENDER_ADDRESS
MAIL_FROM
MAIL_TO
RESUME_BLOB_URL
BOOKINGS_URL
```

Do not put secret values in this repository.

## Build For Deployment

To create the finished static website files:

```bash
npm run build
```

The finished files are written to:

```text
dist/
```

`dist/` is ignored by Git because it is generated by the build command.

## Useful Terms

- Application Programming Interface (API): a way for the website to talk to a
  server-side function.
- Applicant Tracking System (ATS): software companies use to process job
  applications and resumes.
- Git: the version control system that tracks file changes over time.
- GitHub Actions: GitHub's automated build and deployment system.
- HyperText Markup Language (HTML): the standard structure for web pages.
- JavaScript Object Notation (JSON): a text format for structured data.
- Personal Access Token (PAT): a private GitHub key used by automation.
- Portable Document Format (PDF): the common file format used for the resume.
- Static Web App: a website where most files are prebuilt and served directly.
- Uniform Resource Locator (URL): a web address.

## License

You may use this project under the license in [LICENSE](LICENSE). Keep the
required visible credit link to [andrewdicosmo.com](https://andrewdicosmo.com).
