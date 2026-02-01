# Changed files: 0053 - Implementation Agent automatically moves ticket from To Do to Doing

- **vite.config.ts** — Implementation Agent endpoint: Modified ticket fetch to include `kanban_column_id` in SELECT query; added move-to-Doing logic after ticket fetch that moves tickets from `col-todo` to `col-doing` when Implementation Agent run starts, with error handling and frontmatter sync
