# Sentinel5

Sentinel5 is an automated security and quality tool that uses LLM prompts to analyze project files to correlate code changes against historical vulnerabilities and failure patterns.

## Features

- **Automated Defect Extraction:** Fetches bugs from Azure DevOps, deduplicates them, and creates prompt files for root-cause analysis (5-Whys).
- **Pull Request Monitoring:** Queries recent merged pull requests across multiple repositories to identify top impacted files and produces a `weekly_changes.md` report.
- **Predictive Threat Analysis:** Automatically compiles a prompt combining a static base template (`predictive_threat_ingestion_prompt.md`), the `weekly_changes.md` report, and historical insights from `sentinel5_memory.md` into `COMPILED_PREDICTIVE_THREAT_PROMPT.md` for consumption by LLMs.