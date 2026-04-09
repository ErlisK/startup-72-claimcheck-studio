
## Notification System

### Lead Notifications
New lead submissions automatically trigger a team notification via:
1. **AgentMail** (if `AGENTMAIL_API_KEY` + `TEAM_ALERT_EMAIL` are set) — sends an email to `TEAM_ALERT_EMAIL` from `scide-founder@agentmail.to`
2. **GitHub Issues fallback** — if AgentMail is unavailable, creates a GitHub Issue with label `lead` in this repo

### Daily Funnel Digest
`GET /api/daily-digest` — Returns stats JSON (requires Bearer token = `ADMIN_SECRET`)
`POST /api/daily-digest` — Returns stats and sends notification (same auth)

**Trigger manually:**
```bash
curl -X POST https://citebundle.com/api/daily-digest \
  -H "Authorization: Bearer <ADMIN_SECRET>"
```

**Vercel Cron:** Runs daily at 13:00 UTC (`vercel.json`)

### Environment Variables
| Variable | Purpose |
|---|---|
| `TEAM_ALERT_EMAIL` | Email recipient for AgentMail notifications |
| `AGENTMAIL_API_KEY` | AgentMail API key for email delivery |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub token for issue fallback notifications |
| `ADMIN_SECRET` | Bearer token for `/api/daily-digest` auth |

### UTM/Referrer Capture
The lead form captures: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, and `referrer`.
These are included in per-lead notifications. For aggregate UTM analytics, add a `meta` JSONB column to `cc_waitlist`.
