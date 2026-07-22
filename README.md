# The Mission File · a portfolio engine

## Quickstart

```
npm install
npm run dev
```

The site boots at localhost:4321 with a demo persona so you can see everything
running. Then: your story goes in one directory, `src/data`. Deploying takes
one Azure secret. The license asks one thing: a visible credit linking to
[andrewdicosmo.com](https://andrewdicosmo.com).

This is the open source engine behind [andrewdicosmo.com](https://andrewdicosmo.com):
a spy dossier portfolio with a satellite detection scene, a radar sector sweep,
an expandable mission timeline with industry intel markers, an audience lens
(Commercial / Cleared), a three palette theme switcher, and a lead qualifying
brief form that emails an ATS resume through an Azure Function.

**Steal this file.** Fork it, gut it, make it yours. One condition: keep a
visible credit linking to andrewdicosmo.com (see LICENSE).

## Engine vs cargo

The repo is a machine. Your career is cargo. They never mix:

```
src/            the engine: components, styles, scripts (public)
api/            Azure Function: stores leads, emails the resume (public)
content.example the demo persona so the template runs out of the box (public)
src/data/       YOUR content: json + section html + photo (GITIGNORED)
```

`npm run dev` on a fresh clone auto loads the example persona into `src/data`
so the site runs immediately. Replace those files with your own story.

## Make it yours

1. `npm install && npm run dev`
2. Edit everything in `src/data`:
   - `profile.json` name, typed brief, firm, channels, repo url
   - `timeline.json` ordered phases, operations, intel markers
   - `sectors.json` radar sectors and center labels
   - `loadout.json` capability cards
   - `brief.json` form options (salary floor, budget bands, project chips)
   - `sections/*.html` hero, product demos, gift, debrief markup
   - `assets/subject.webp` your processed photo (grayscale, background removed)
3. Deploy to Azure Static Web Apps (workflow included). Set the Function app
   settings from `.env.example` to activate the brief pipeline: lead storage,
   attachment upload, resume email, scheduler link.

## Private content injection

Keep your real `src/data` in a **private repo**. Add two secrets to this repo:
`CONTENT_REPO` (e.g. `you/your-content`) and `CONTENT_REPO_PAT`. The workflow
clones it at build time and swaps out the example persona, so the public repo
never carries your career, your photo, or anything you later remove.

## The brief pipeline

`POST /api/brief` validates the lead, writes it to Azure Table Storage,
uploads any attached job req to Blob Storage, emails the ATS resume PDF to the
submitter via SendGrid (delivery to their inbox is the email verification),
notifies you with the full brief, and returns the Microsoft Bookings link only
when the brief was substantive. No resume link exists anywhere on the site.

## Honest notes

- Product demo sections (`sections/DEMOS.html`) are cargo but not yet fully
  data driven; edit the html directly or replace the section.
- The satellite scene is engine art: generic by design, personalize the log
  lines in `main.js` if you want.
- No dashes in the prose. House rule. You will thank me.
