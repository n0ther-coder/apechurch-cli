# Set up and operate log and script buckets

Use `bucket:log` for bot logs and `bucket:script` for command-script JSON. This guide uses two independent example buckets, `example-logs` and `example-scripts`; replace them with the names you create. All CLI configuration is local to the current machine and config directory.

## What each step actually does

| Step | Where it happens | Result |
|------|------------------|--------|
| Create a bucket and access token | Cloudflare dashboard | Creates remote storage and grants access |
| `bucket:log install <bucket>` / `bucket:script install <bucket>` | Local machine | Encrypts and saves credentials, then selects that bucket for the chosen type |
| `reinstall <bucket>` | Local machine | Replaces the saved credentials and selects the bucket again |
| `enable <bucket>` | Local machine | Selects an already saved credential entry for that type |
| `disable` | Local machine | Clears that type's selection, retaining credentials and all files |
| `bucket status` | Local machine | Shows both selections and every saved bucket, including inactive entries |
| `bucket:log sync` / `bucket:script sync` | Local machine and R2 | Transfers files in both directions using the selected entry |

**`install` does not create a bucket on Cloudflare or check that it exists.** A successful install or enabled status proves only that local configuration was saved. `enable` does not start a background service. `disable` does not revoke a token, delete data, or reconfigure an already-running bot. `empty` also requires an enabled bucket for its command type; after disabling it, select a bucket with `enable` before emptying remote objects.

## 1. Create private buckets in Cloudflare

In the Cloudflare dashboard, open **Storage & databases → R2 → Overview**, activate R2 if needed, and create `example-logs` and `example-scripts`. If your log bucket already exists, keep it and create only the script bucket. See [Cloudflare's S3 setup guide](https://developers.cloudflare.com/r2/get-started/s3/).

Keep both buckets private. Do not enable an `r2.dev` public URL or public access through a custom domain for this workflow. Authenticated sync and temporary presigned downloads work without making the bucket public. See [Cloudflare's public-bucket settings](https://developers.cloudflare.com/r2/buckets/public-buckets/).

**Endpoint limitation:** the CLI currently constructs `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` and exposes no jurisdiction/endpoint setting. Use buckets accessible through this default endpoint. Jurisdiction-restricted buckets require a different endpoint and are not supported by the current CLI configuration. See [Cloudflare's endpoint requirements](https://developers.cloudflare.com/r2/api/tokens/).

## 2. Create the access credentials

From the R2 overview, open the API token manager. Create an R2 token with **Object Read & Write** permission, restricted to the intended bucket. Repeat for the other bucket. Save the generated token value, access key ID, and secret access key in a password manager; Cloudflare does not show the secret access key again. See [Cloudflare's R2 authentication guide](https://developers.cloudflare.com/r2/api/tokens/).

For normal sync, use object read/write permissions rather than bucket-administration permissions. The CLI installer does not need permission to create buckets. Two tokens, each restricted to one bucket, allow independent replacement or revocation. On multiple machines, separate tokens per machine further isolate access.

| Installer field / variable | What to supply | Shared or separate? |
|----------------------------|----------------|---------------------|
| Bucket / `APECHURCH_CLI_R2_NAME` | Existing R2 bucket name | Use different names for logs and scripts |
| Account ID / `APECHURCH_CLI_R2_ACCOUNT_ID` | Cloudflare account ID | Normally identical when both buckets are in one account |
| API token / `APECHURCH_CLI_R2_TOKEN` | R2 API token value | Can differ; prefer a token restricted to each bucket |
| Access key / `APECHURCH_CLI_R2_KEY` | Generated S3 access key ID | Use the pair belonging to that bucket's token |
| Secret key / `APECHURCH_CLI_R2_SECRET` | Generated S3 secret access key | Use the pair belonging to that bucket's token |
| Encryption password / `APECHURCH_CLI_PASS` | Your local encryption passphrase | Separate from Cloudflare credentials; unlocks local encrypted files |

A shared token/key pair also works if its permissions cover both buckets. Account IDs can differ too. However, local credential entries are indexed **only by bucket name**, not by account or command type: two accounts with the same bucket name would collide locally. Selecting the same bucket name for both types shares one credential entry, and reinstalling it replaces credentials for both. Prefer distinct names and separate storage.

The current installer requires the API token as well as the key pair. S3 transfers and presigning authenticate with the access key ID and secret access key; the stored API token is not used for those requests. This does not require a second, more privileged administration token.

## 3. Understand the shared install variables

All five `APECHURCH_CLI_R2_*` variables in the table are **common inputs to both installers**. There is no separate log/script environment namespace.

- An explicit bucket argument takes precedence over `APECHURCH_CLI_R2_NAME`. If that variable is set, a notice reports the precedence without asking for confirmation, even when the values match.
- Without a bucket argument, the installer uses `APECHURCH_CLI_R2_NAME` and reports that source.
- Nonempty account/token/key/secret variables supply their fields directly, so the corresponding interactive questions are not presented. These fields currently have no command-line options.
- If variables are absent, the interactive installer asks for the missing values. Environment values never replace answers entered at those prompts. Token, secret key, and password input is hidden.
- Each install saves the values into that named bucket's encrypted local entry.
- Subsequent sync/presign operations use the saved entry. Changing the install variables alone does not change stored credentials; use `reinstall`.

Source and precedence notices are written to stderr, including with `--json`, so JSON stdout stays parseable. They identify the variable but never print its value. Missing required values in a non-interactive invocation still produce an error.

For example, installing logs and then installing scripts without changing existing credential environment values saves the **same credentials twice**. That is valid only if they grant access to both buckets. It does not automatically generate a second token or copy permissions.

To enter new credentials through interactive questions instead of using existing environment values, clear the corresponding variables first:

```bash
unset APECHURCH_CLI_R2_NAME APECHURCH_CLI_R2_ACCOUNT_ID APECHURCH_CLI_R2_TOKEN
unset APECHURCH_CLI_R2_KEY APECHURCH_CLI_R2_SECRET
```

`APECHURCH_CLI_PASS` supplies the encryption password without asking interactively, and the CLI reports its source without revealing the password. To choose the password interactively in this shell, clear it too:

```bash
unset APECHURCH_CLI_PASS
```

These commands only change the current shell environment; they do not erase credentials already installed or remove values from shell startup files. If you use automation, have your secret manager inject the appropriate values for each install instead of putting literal secrets in command history.

## 4. Install and activate both entries locally

```bash
# Supply the log bucket's account/token/key/secret at the prompts.
apechurch-cli bucket:log install example-logs

# Supply the script bucket's credentials at this separate set of prompts.
apechurch-cli bucket:script install example-scripts

# No secrets or remote requests: overview of all saved buckets.
apechurch-cli bucket status
apechurch-cli bucket status --json

# Inspect a single purpose when needed.
apechurch-cli bucket:log status
apechurch-cli bucket:script status
```

Both installs already enable their selection: a separate `enable` is unnecessary. A typical overview contains:

```text
example-logs     [log: enabled, script: disabled]
example-scripts  [log: disabled, script: enabled]
```

The flags indicate local selection, not remote permissions. Previously installed but unselected buckets also appear. JSON has `log` and `script` metadata plus a `buckets` array with `bucket`, `log_enabled`, and `script_enabled`. A saved entry has no permanent log/script label; an inactive entry's original purpose is not inferred.

Credentials are stored under `$APECHURCH_CLI_CONFIG_DIR/r2/<bucket>.json` (default config directory: `~/.apechurch-cli`). The log selector is `r2/current.json`; the script selector is `r2/script/current.json`. `bucket` alone also shows the overview. Other unqualified `bucket` actions use logs, except `empty`, which requires `bucket:log` or `bucket:script`. Unqualified `bucket empty` is rejected.

To change activation later:

```bash
apechurch-cli bucket:script disable
apechurch-cli bucket status                  # Scripts inactive; logs unaffected
apechurch-cli bucket:script enable example-scripts

apechurch-cli bucket:log disable             # Applies to future operations/new bot processes
apechurch-cli bucket:log enable example-logs
```

There is one active entry per type per local config directory. Repeat installation on each machine that needs access; activation is not synchronized between machines. A running bot keeps the R2 configuration loaded when its mirror started, so stop/restart that process if it must pick up a new selection.

## 5. Select a path and run the first log sync

**Both types follow the same rule:** `sync [path]` includes direct files only; `sync [path] -r` includes every descendant folder. The default path is the configured local root; `.` also selects it. Relative paths are preserved on the bucket. `bucket sync` is log sync only, never a combined log/script transfer.

```bash
apechurch-cli bucket:log sync archive/            # Direct log files in archive
apechurch-cli bucket:log sync archive/ -r         # Include descendants
apechurch-cli bucket:script sync routines/        # Direct scripts in routines
apechurch-cli bucket:script sync routines/ -r     # Include descendants
apechurch-cli bucket:script sync routines/report-v2.json
```

Use `folder/` to make a directory selection explicit. Absolute paths and traversal are rejected; symlinks are skipped. Without `-r`, excluded folders produce `recursive-required` inconsistencies and a recursive-option hint. Empty directories have no objects to transfer. All bucket help variants describe both types and this shared behavior.


```bash
# All eligible logs under APECHURCH_CLI_LOG_DIR.
apechurch-cli bucket:log sync -r

# Or limit the transfer to a single bot's log folder.
apechurch-cli bucket:log sync example-bot
```

This is a real two-way transfer, not a connection-only test or dry run. Review the uploaded/downloaded/skipped counts and any inconsistencies. Authentication, permission, endpoint, or missing-bucket errors may first appear here, even if install succeeded.

The default local log directory is `~/.apechurch-cli/log`; `APECHURCH_CLI_LOG_DIR` overrides it. Remote keys use `<bot>/<bot>.<timestamp>.json`. An optional `APECHURCH_CLI_R2_PREFIX` adds a prefix for log mirror/sync only:

```bash
APECHURCH_CLI_R2_PREFIX=archive apechurch-cli bucket:log sync example-bot
```

Use the same intended prefix in all processes/machines sharing that log tree. Changing it changes the remote namespace; the CLI does not move old objects automatically.

For automatic uploads during normal bot runs, the log entry must be selected and the bot process must receive `APECHURCH_CLI_PASS` so it can decrypt that entry. Inject it through your local secret manager or protected launcher, then start your usual bot command. These uploads are best-effort; local logs remain if an upload fails. Run explicit sync to reconcile missed or remote-only logs. This is not a filesystem daemon watching every local edit.

If the same process unlocks both a wallet and the log entry, its one `APECHURCH_CLI_PASS` value must decrypt both. Use the corresponding local encryption password when installing the log entry. This is independent of whether Cloudflare log/script tokens are different.

## 6. Sync and maintain scripts

Scripts default to `~/.apechurch-cli/scripts`; `APECHURCH_CLI_SCR_DIR` overrides that directory. Valid command-script JSON keeps its relative path on R2, including subfolders when `-r` is used. The log prefix does not apply.

```bash
# Bring in revisions from the entire tree before editing.
apechurch-cli bucket:script sync -r

# Create a new, manually named revision with a harmless example command.
apechurch-cli script write report-v2 games

# Upload that revision and reconcile the same name remotely.
apechurch-cli bucket:script sync report-v2

# On another configured machine, download and inspect it before use.
apechurch-cli bucket:script sync
apechurch-cli script read report-v2
```

The maintenance sequence is **sync → local change under a new name → sync**. Choose every name/version suffix yourself; the CLI neither increments versions nor interprets `v2` as newer than `v1`. Coordinate names between editors. Sync uploads local-only files and downloads remote-only ones; matching names compare local modification time with remote upload time. A timestamp tie with different contents is skipped and reported, not merged.

Nested script paths can be synchronized as files; the separate `script read`, `script write`, and `script watch` commands still accept names in their configured script directory.

Script sync does not run downloaded commands, schedule periodic transfers, or reload an existing `script watch` process. The watcher continues using the JSON loaded at startup. Sync never propagates deletions in either direction.

## 7. Download links and remote cleanup

```bash
# Latest timestamped log, resolving the remote candidate before cache reuse.
apechurch-cli bucket:log presign

# A specific script, with a 15-minute lifetime for a newly generated URL.
apechurch-cli bucket:script presign report-v2 -t 900

# Download JSON locally without running it.
apechurch-cli bucket:log presign example-bot -o latest-log.json

# Each empty operation lists its remote selection and requires typing EMPTY.
apechurch-cli bucket:script empty report-v1.json
apechurch-cli bucket:log empty archive/
apechurch-cli bucket:script empty
```

`empty` deletes remote objects only. It preserves the bucket, credentials, and local files; subsequent sync can upload those local copies again. A trailing slash selects a folder recursively. Without it, an exact existing object wins over a folder interpretation. `empty [path]` requires an explicit command type: `bucket:log empty` or `bucket:script empty`. It uses that type's selected bucket. Unqualified `bucket empty` is rejected before credentials are read or R2 is contacted. Omit the path to empty that entire bucket. A supplied path is relative to the bucket root, without a bucket name; include any log prefix explicitly. Folder contents are selected recursively without `-r`.

Presigned URLs grant download access to anyone holding them. Default/max lifetime is seven days; `-t` affects new links only. An unexpired cached link for the selected object retains its original expiry. No-path log presign selects by filename timestamp; no-path script presign selects by remote upload time. See the [command reference](COMMAND_REFERENCE.md#r2-buckets) for more path and output examples.

## 8. Protect and replace credentials

- Keep the original Cloudflare credential sets and local passphrases in a password manager. Prefer prompts for manual use and short-lived environment injection for automation. Avoid literal secrets in shell commands/history, startup files, repositories, script JSON, logs, screenshots, or chat.
- Credential payloads are encrypted locally with AES-256-GCM and a password-derived key. The CLI writes config files with owner-only `0600` permissions where supported. Directory permissions depend on the local environment: restrict access to the config directory and protect backups with OS permissions and disk/backup encryption.
- **The entire config file is not encrypted.** Bucket metadata and cached presigned URLs are outside the encrypted credential payload. Protect those files and backups as well as the password. Local credential encryption also does not encrypt the uploaded JSON contents; keep remote buckets private.
- Normal status/list output omits secrets. `status -v` and `list -v` intentionally decrypt and print them. Aggregate `bucket status -v` exposes credentials for every stored entry, including inactive entries, and requires a password that decrypts them all. Do not capture that output in shared logs. If entries use different passwords, inspect their selected type individually with the appropriate password.
- Environment variables are not a secret vault: the running process and, depending on OS privileges, other local processes can access them. Supply `APECHURCH_CLI_PASS` only to processes that need it; clearing it in the parent shell does not remove it from already-running children.
- Disabling a selection is not an access-revocation mechanism. If credentials are exposed, revoke the corresponding token in Cloudflare, generate a replacement, and reinstall it on every affected machine. For routine rotation, install and verify the replacement before revoking the old token.

```bash
# Replace credentials using prompts or newly injected install variables.
apechurch-cli bucket:log reinstall example-logs
apechurch-cli bucket:script reinstall example-scripts
apechurch-cli bucket status

# These perform actual transfers and verify the new access in use.
apechurch-cli bucket:log sync -r
apechurch-cli bucket:script sync
```

Reinstall also enables the entry. Restart any running process that must use the new credentials. Changing a passphrase environment variable alone does not re-encrypt existing files: reinstall each affected R2 entry with the new local encryption password and its Cloudflare credentials. Wallet password management is separate.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Install succeeded but sync fails | Bucket exists; saved account/key pair and token permissions match it; supported endpoint; network access |
| Script install used log credentials unexpectedly | Both installers use the same environment variables and report their source; change them, or unset them to answer interactive questions, then reinstall |
| Status says enabled but no background transfers happen | Status is local selection; scripts require explicit sync, and bot log mirroring requires the password in the bot process |
| Disable did not stop an existing bot's uploads | That process retained its configuration; stop/restart it, or revoke remote access when revocation is intended |
| Subfolders appear in Inconsistencies | Add `-r` / `--recursive` to include them, for either logs or scripts |
| Deleted remote scripts return | Local copies remain; sync uploads them again |
| Different `-t` did not shorten a presigned URL | The valid cached URL retained its original expiry |
| A second machine has no active bucket | Install/select locally on that machine; cloud objects do not carry local credentials or selectors |
