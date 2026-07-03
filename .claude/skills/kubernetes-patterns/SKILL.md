---
name: kubernetes-patterns
description: "Kubernetes Patterns — Kubernetes Patterns 相关功能和最佳实践"
metadata:
  origin: ECC
---

# Kubernetes Patterns

Production-grade Kubernetes patterns for deploying, managing, and debugging workloads reliably.

## When to Activate

- Writing Kubernetes manifests (Deployments, Services, Ingress, Jobs)
- Configuring resource requests/limits, liveness/readiness probes
- Setting up RBAC, namespaces, or ServiceAccounts
- Managing configuration and secrets in K8s
- Debugging CrashLoopBackOff, OOMKilled, pending pods, or image pull errors
- Configuring HPA (Horizontal Pod Autoscaler) or PodDisruptionBudgets
- Reviewing K8s YAML for security or correctness

## When to Use

> Same as **When to Activate** above. This alias satisfies repo skill-format conventions. Use this skill any time you are writing, reviewing, or debugging Kubernetes YAML and workloads.

## How It Works

This skill provides **copy-pasteable, production-grade YAML patterns** and **kubectl debugging commands** organized by task:

1. **Deployment template** — A fully configured production `Deployment` with security context, rolling update strategy, all three probe types, resource limits, and environment injection from ConfigMap/Secret.
2. **Probes** — Decision table for startup vs liveness vs readiness, with correct `failureThreshold × periodSeconds` math.
3. **Services & Ingress** — ClusterIP, LoadBalancer, and TLS Ingress patterns with cert-manager annotations.
4. **ConfigMaps & Secrets** — `envFrom`, file-mount, and external secrets guidance.
5. **Resource management** — Requests vs limits rules of thumb by workload type (web API, JVM, worker, sidecar).
6. **RBAC** — Least-privilege ServiceAccount → Role → RoleBinding chain.
7. **HPA & PDB** — Autoscaling and node-drain safety configurations.
8. **Jobs & CronJobs** — One-off and scheduled workload patterns with correct `restartPolicy`.
9. **kubectl cheatsheet** — Logs, exec, rollback, port-forward, dry-run, and common error diagnosis commands.
10. **Anti-patterns & checklist** — What NOT to do, and a security/reliability/observability checklist.

## Examples

See the sections below for complete, runnable examples. Quick references:

| Task | Jump to |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 36 MINUTES 12 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE