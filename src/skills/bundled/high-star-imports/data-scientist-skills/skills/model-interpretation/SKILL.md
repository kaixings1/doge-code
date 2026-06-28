---
name: model-interpretation
description: "Interpret ML model predictions: SHAP values, permutation importance, partial dependence plots, individual conditional expectation, LIME, and counterfactual explanations. Use when explaining model behavior to stakeholders, debugging model decisions, or meeting regulatory requirements."
---

# Model Interpretation

## Purpose
Explain why the model makes specific predictions. Essential for stakeholder trust, debugging, and regulatory compliance (GDPR, ECOA).

## How It Works

### Global Explanations (Overall Model Behavior)

| Method | What It Shows |
|--------|--------------|
| **SHAP Summary Plot** | Feature importance + direction of effect for all predictions |
| **Permutation Importance** | Mean decrease in metric when feature is shuffled |
| **Partial Dependence (PDP)** | Average effect of one feature on prediction |
| **Feature Interaction** | SHAP interaction values between feature pairs |

### Local Explanations (Individual Predictions)

| Method | What It Shows |
|--------|--------------|
| **SHAP Waterfall** | Contribution of each feature to one prediction |
| **LIME** | Local linear approximation around one point |
| **ICE Plot** | Individual Conditional Expectation curves |
| **Counterfactual** | Smallest change needed to flip the prediction |

### Implementation
1. Train your model (any sklearn-compatible model)
2. Compute SHAP values using TreeExplainer / KernelExplainer
3. Generate summary, dependence, and waterfall plots
4. Identify top features and their directional effects
5. Create narrative explanations for stakeholders

## Usage Examples

```
"Explain why this customer was predicted to churn —
what features drove the prediction?"
```

```
"Generate SHAP plots for our loan approval model
for the compliance review"
```

## Output Format

- **Global Importance**: SHAP summary plot + ranked feature list
- **Partial Dependence**: PDP for top features
- **Local Explanation**: Waterfall plot for specific predictions
- **Narrative**: Plain-language explanation of model behavior
- **Python Code**: SHAP / LIME implementation

---

### Further Reading

- Christoph Molnar — *Interpretable Machine Learning*
- Scott Lundberg — [SHAP documentation](https://shap.readthedocs.io/)
