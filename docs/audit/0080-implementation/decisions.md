# Decisions: 0080 - Unify purple UI colors

## D1: Base hue 258° from primary color

- **Decision**: Use hue 258° (from `#6b4ce6` primary) as the unified base hue for all purples.
- **Why**: `#6b4ce6` is the primary purple used throughout the app and provides a good base for the scale. Other purples were close (258-260°) but not exact.

## D2: Unified purple scale with CSS variables

- **Decision**: Create `--hal-purple-900` through `--hal-purple-10` scale variables with consistent hue 258°, varying only saturation/lightness.
- **Why**: Single source of truth for purple colors; easy to maintain and ensure consistency. Semantic variables (`--hal-primary`, etc.) reference the unified scale.

## D3: Keep existing purple-tinted neutrals

- **Decision**: Keep some existing colors like `--hal-border: #e5e0f0` and `--hal-header-subtitle: #b8a9d4` as-is (they are purple-tinted neutrals, not pure purples).
- **Why**: These serve as subtle background/border colors and don't need to be pure purple. They maintain the purple theme without being part of the accent scale.

## D4: Direct hex values in Kanban work buttons

- **Decision**: Use direct hex values from unified scale in `.column-work-button` rather than CSS variables.
- **Why**: Kanban is a separate component that doesn't have access to HAL's CSS variables. Using the same hex values ensures visual consistency while maintaining component independence.

## D5: Maintain rgba() opacity values

- **Decision**: Keep existing rgba() opacity values (e.g., `rgba(107, 76, 230, 0.1)`) but ensure RGB values match unified purple scale.
- **Why**: Opacity overlays are important for visual hierarchy. Using unified purple RGB ensures consistent hue even at reduced opacity.
