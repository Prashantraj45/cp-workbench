# Enhanced History — Design Spec
Date: 2026-06-07

## Overview

Transform the DataManagement modal into a full-featured problem history view with tags (auto-scraped per platform + manually editable), manual/auto problem groups, and client-side filters.

**KPIs:** Filter response <16ms (client-side), tag scraping non-blocking (problem created even if scraping fails), no new loading spinners in the main editor flow.

---

## Stack Additions

| Layer | Addition |
|-------|----------|
| DB | 4 new tables (tags, problem_tags, groups, problem_group_memberships) |
| Rust | 10 new Tauri commands |
| Frontend | 3 new/rewritten components |
| Scraping | CF: HTML selector; LC: GraphQL; CSES: none |

---

## Data Model

Added as additive migration in `src-tauri/src/db.rs` `migrate()`:

```sql
CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#58a6ff'
);

CREATE TABLE IF NOT EXISTS problem_tags (
  problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'scraped'
  PRIMARY KEY (problem_id, tag_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS problem_group_memberships (
  problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, group_id)
);
```

---

## Tag Scraping

Scraping runs inside scaffold commands. Failure is silent — problem is created regardless.

### Codeforces
Selector added to existing `fetch_cf_problem` in `workspace.rs`:
```rust
let tag_sel = Selector::parse(".tag-box a").unwrap();
let tags: Vec<String> = document
    .select(&tag_sel)
    .map(|e| e.text().collect::<String>().trim().to_string())
    .filter(|s| !s.is_empty())
    .collect();
```

### LeetCode
New `fetch_lc_problem(url)` in `workspace.rs`. Parses `titleSlug` from URL, then:
```
POST https://leetcode.com/graphql
Content-Type: application/json

{ "query": "{ question(titleSlug: \"<slug>\") { title difficulty topicTags { name } sampleTestCase exampleTestcases } }" }
```
Returns: title, difficulty, tags, sample I/O. No auth required for public problems.

URL formats supported:
- `https://leetcode.com/problems/<slug>/`
- `https://leetcode.com/problems/<slug>/description/`

### CSES
No tags available on CSES HTML. Tags array is empty. User adds manually.

### New `scaffold_lc_problem` command
Mirrors `scaffold_cf_problem`:
- Parses LC URL → slug
- Fetches GraphQL data
- Creates problem folder at `base_dir/LC_<slug>/`
- Writes main.cpp (template), input.txt (sample), notes.md
- Inserts problem + scraped tags into DB

### New `scaffold_sces_problem` command  
URL format: `https://cses.fi/problemset/task/<id>/`
- HTTP GET + parse title from `h1.title`
- No time/memory limit on page (use defaults: 1000ms, 256MB)
- No tags
- Creates folder at `base_dir/CSES_<id>/`

---

## New Rust Types

```rust
// src-tauri/src/models.rs additions
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}
```

---

## Rust Commands

All in `src-tauri/src/commands.rs`, registered in `src-tauri/src/lib.rs`:

| Command | Args | Returns | Description |
|---------|------|---------|-------------|
| `get_tags` | — | `Vec<Tag>` | All tags in predefined list |
| `create_tag` | name, color | `Tag` | Add tag to predefined list |
| `delete_tag` | id | `()` | Remove tag + all problem_tags |
| `get_problem_tags` | problem_id | `Vec<Tag>` | Tags on a specific problem |
| `set_problem_tags` | problem_id, tag_ids: Vec<String> | `()` | Replace all tags on problem |
| `get_groups` | — | `Vec<Group>` | All manual groups |
| `create_group` | name | `Group` | New manual group |
| `delete_group` | id | `()` | Remove group + memberships |
| `rename_group` | id, name | `()` | Rename group |
| `get_group_members` | group_id | `Vec<String>` | Problem IDs in group |
| `set_group_members` | group_id, problem_ids: Vec<String> | `()` | Replace group membership |
| `get_run_count` | problem_id | `i64` | Count of runs for problem |

`scaffold_lc_problem(url, base_dir, template)` and `scaffold_sces_problem(url, base_dir, template)` also added.

---

## Frontend Types

```typescript
// src/lib/types.ts additions
export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Group {
  id: string;
  name: string;
  created_at: number;
}

export interface ProblemWithMeta extends Problem {
  tags: Tag[];
  groupIds: string[];
  runCount: number;
}
```

---

## Frontend Components

### `src/components/DataManagement.tsx` — full rewrite

Full-screen overlay (not modal). Two-column layout:
- **Left: Filter panel (220px)** — platform radio, tag checkboxes, group radio, auto-group list
- **Right: Problem list** — filtered rows with name, tag chips, platform badge, run count, open/rename/delete actions

Filter state is local `useState` — all filtering client-side over the `problems` array enriched with tags/groups loaded on open.

Auto-groups derived from `problem.url`:
- Platform: detect `codeforces.com` → CF, `leetcode.com` → LC, `cses.fi` → CSES
- CF contest: extract contest ID from CF URLs, group by it

### `src/components/TagManager.tsx` — new

Small modal (400px) opened from "Manage tags" link in filter panel.
- Lists all tags with color dot + name
- Add tag: name input + color picker (6 preset colors)
- Delete tag button (with count of problems using it shown)
- Changes call `create_tag` / `delete_tag`, reload tags in parent

### `src/components/GroupManager.tsx` — new

Inline panel within DataManagement right column, toggled per-problem.
- Dropdown/checklist of all manual groups
- "New group" input inline
- Checking/unchecking calls `set_group_members` for that group

---

## Zustand Store Additions

```typescript
// src/store/useStore.ts additions
tags: Tag[];
groups: Group[];
setTags: (tags: Tag[]) => void;
setGroups: (groups: Group[]) => void;
```

Tags and groups loaded once on app start alongside `getProblems`.

---

## WorkspaceGenerator Changes

Add LC and CSES to the URL scaffold path:
- Detect URL platform before calling scaffold command
- CF URL → `scaffold_cf_problem`
- LC URL → `scaffold_lc_problem`  
- CSES URL → `scaffold_sces_problem`
- Unknown URL → show error toast

---

## API additions (`src/lib/tauri.ts`)

```typescript
getTags: () => invoke<Tag[]>('get_tags'),
createTag: (name: string, color: string) => invoke<Tag>('create_tag', { name, color }),
deleteTag: (id: string) => invoke<void>('delete_tag', { id }),
getProblemTags: (problemId: string) => invoke<Tag[]>('get_problem_tags', { problemId }),
setProblemTags: (problemId: string, tagIds: string[]) => invoke<void>('set_problem_tags', { problemId, tagIds }),
getGroups: () => invoke<Group[]>('get_groups'),
createGroup: (name: string) => invoke<Group>('create_group', { name }),
deleteGroup: (id: string) => invoke<void>('delete_group', { id }),
renameGroup: (id: string, name: string) => invoke<void>('rename_group', { id, name }),
getGroupMembers: (groupId: string) => invoke<string[]>('get_group_members', { groupId }),
setGroupMembers: (groupId: string, problemIds: string[]) => invoke<void>('set_group_members', { groupId, problemIds }),
getRunCount: (problemId: string) => invoke<number>('get_run_count', { problemId }),
scaffoldLcProblem: (url: string, baseDir: string, template: string) => invoke<Problem>('scaffold_lc_problem', { url, baseDir, template }),
scaffoldScesProblem: (url: string, baseDir: string, template: string) => invoke<Problem>('scaffold_sces_problem', { url, baseDir, template }),
```

---

## Non-Goals

- No server-side filtering or pagination (all client-side)
- No tag colors beyond 6 presets
- No nested groups
- No run history detail view (just count shown)
- No CSES tag scraping (CSES HTML has none)
- No LeetCode submission (separate project C)
