# Plan: 0080 - Unify purple UI colors

## Goal

Unify all purple UI colors so they share one consistent hue across the app, varying only saturation/lightness by usage.

## Analysis

### Current State

- **HAL app (`src/index.css`)**: Uses multiple purple hues:
  - Primary: `#6b4ce6` (hue ~258°)
  - Accent: `#8b6cef` (hue ~260°)
  - Primary hover: `#5a3fd4` (hue ~258°)
  - Header bg: `#3d2d6b` (hue ~258°)
  - User message gradient: `#7c5ee8` to `#6b4ce6` (hue ~258°)
  - Various borders and backgrounds with slight hue variations

- **Kanban (`projects/kanban/src/index.css`)**: Uses different purple values:
  - Work buttons: `#8b5cf6`, `#f3e8ff`, `#6d28d9`, `#e9d5ff`, `#7c3aed` (hue ~258-260°)

### Required Changes

1. **Create unified purple scale**
   - Choose base hue: 258° (from `#6b4ce6` primary)
   - Create CSS variable scale: `--hal-purple-900` through `--hal-purple-10` with consistent hue 258°, varying saturation/lightness
   - Map all existing purple values to unified scale

2. **Update HAL app CSS**
   - Replace all hardcoded purple hex values with unified scale variables
   - Update semantic variables (`--hal-primary`, `--hal-accent`, etc.) to reference unified scale
   - Ensure light and dark themes both use unified hue

3. **Update Kanban CSS**
   - Replace hardcoded purple values in `.column-work-button` with unified scale values
   - Ensure consistency with HAL app purple palette

## Implementation

1. **src/index.css**
   - Add unified purple scale variables (`--hal-purple-900` through `--hal-purple-10`) with hue 258°
   - Update semantic variables to reference unified scale
   - Replace hardcoded purple hex values in gradients and rgba() calls
   - Update dark theme to use unified scale

2. **projects/kanban/src/index.css**
   - Replace `.column-work-button` purple hex values with unified scale values

## Files to Change

- `src/index.css` — unified purple scale, semantic variable updates
- `projects/kanban/src/index.css` — work button purple values

## Non-goals (per ticket)

- Changing non-purple colors (greens, reds, etc.)
- Adjusting contrast ratios beyond ensuring readability is maintained
- Creating new purple UI elements
