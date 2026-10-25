# Project maintenance toolbox

Run these scripts from any working directory; they resolve the project root from their own location.

- `Update.cmd` installs from the committed lockfile. Run `Update.cmd -Upgrade` to update packages within the ranges already declared by the project.
- `Check.cmd` runs the configured type/lint/isolation checks and the package security audit. Run `Check.cmd -SkipAudit` to omit the network audit, or `Check.cmd -AuditOnly` to run only the audit.
- `Test.cmd` runs all configured suites when no `default` suite is declared. Use `Test.cmd -List`, `Test.cmd -Suite <name>`, or `Test.cmd -All` to choose suites explicitly.

Package caches and pnpm stores are written below `E:\Installments\<project>`. Project `node_modules` remains in the project so workspace links and native tooling keep working.

These scripts manage dependencies, checks, and tests only. Project update pipelines that migrate/seed databases, export builds, commit, push, deploy, or modify remote data remain separate and are never called by this toolbox.
