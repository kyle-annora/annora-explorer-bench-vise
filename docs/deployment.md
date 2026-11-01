# Deployment

## GitHub Pages

1. Create your own repository from the template. Public repositories support
   Pages on free personal accounts; private repository availability depends on
   your GitHub plan and organization policy.
2. Set **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Push a commit to `main`, or run **Deploy Explorer** from the Actions tab.
4. The workflow installs the lockfile, validates assets, runs regression tests,
   builds the configured site and uploads only `dist/`.
5. Open the URL reported by the deployment job. Test the exact repository
   subpath, model switch, tour and mobile layout there.

Configuration of the Pages source is a one-time owner action; creating a new
repository does not bypass account policy or automatically grant that permission.
Subsequent pushes to `main` deploy after validation. Pull requests run checks but
do not deploy. Organization restrictions may require an administrator to enable
Actions or approve the `github-pages` environment.

If you use the GitHub CLI as the repository owner:

```sh
gh api repos/OWNER/REPOSITORY/pages --method POST -f build_type=workflow
gh workflow run pages.yml --repo OWNER/REPOSITORY
```

For an existing Pages site, use `--method PUT` instead of `POST`. Keep repository
names explicit. Authentication must permit repository/workflow changes; never
store a token in project configuration or checked-in files.

The workflow pins action revisions and uses Node 22. It grants `contents: read`
for builds and `pages: write` plus `id-token: write` only for the deploy job. Review
pinned actions and dependency updates regularly. `base: './'` keeps built links
valid under a project Pages path and a custom domain.

Official reference: [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Other static hosts

```sh
npm ci
npm run verify
```

Upload the contents of `dist/` to a static host. Keep relative directory structure
and serve over HTTP(S), not `file://`. Support normal `.glb`, `.bin`, `.json` and
`.gz` downloads. The application handles its prepared gzip assets; avoid double
compression or incorrectly labelling gzip bytes as already decompressed content.
There is no server runtime or secret configuration.

## Troubleshooting

- **No deployment:** check the Pages source, Actions permissions and run log.
- **404 at the project URL:** wait for a successful Pages deployment; use the
  repository path shown by the job rather than the account root.
- **Missing models:** confirm their manifest paths in `project.config.json`, run
  `npm run check`, then rebuild. Do not deploy the unbuilt source tree.
- **Import refusal:** fix the specific source/definition error or choose an empty
  output directory. The importer intentionally refuses silent overwrite.
- **Blank iframe controls:** verify the exact parent and child origins and wait
  for the handshake. A routing handshake is not account authentication.

A public static deployment exposes its configured geometry, metadata, tours and
brand assets to visitors. Include only content you can redistribute.
