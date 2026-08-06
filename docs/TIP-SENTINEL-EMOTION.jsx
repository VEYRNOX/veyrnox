/**
 * TIP Intelligence Dashboard — CSS-in-JS (Emotion)
 *
 * Installation:
 * npm install @emotion/react @emotion/styled
 *
 * Usage:
 * import { StatCardStyled, tipThemeEmotion } from './TIP-SENTINEL-EMOTION';
 * import { ThemeProvider } from '@emotion/react';
 *
 * <ThemeProvider theme={tipThemeEmotion}>
 *   <StatCardStyled>...</StatCardStyled>
 * </ThemeProvider>
 */

import styled from '@emotion/styled';
import { css } from '@emotion/react';

// ============================================================================
// EMOTION THEME OBJECT
// ============================================================================

export const tipThemeEmotion = {
  colors: {
    surface: {
      primary: '#0d1117',
      secondary: '#161b22',
      tertiary: '#21262d',
      hover: 'rgba(88, 166, 255, 0.05)',
    },
    text: {
      primary: '#e6edf3',
      secondary: '#8b949e',
      tertiary: '#6e7681',
      muted: 'rgba(139, 148, 158, 0.6)',
    },
    accent: {
      primary: '#58a6ff',
      hover: '#79c0ff',
      dark: '#0969da',
    },
    semantic: {
      success: '#3fb950',
      warning: '#d29922',
      danger: '#f85149',
      info: '#79c0ff',
    },
    border: {
      default: 'rgba(48, 54, 61, 0.5)',
      light: 'rgba(48, 54, 61, 0.2)',
      divider: 'rgba(48, 54, 61, 0.3)',
    },
  },
  typography: {
    fontFamily: {
      base: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif',
      mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace',
    },
    fontSize: {
      display: '32px',
      headline: '24px',
      title: '18px',
      bodyLg: '16px',
      body: '14px',
      small: '12px',
      mono: '13px',
    },
    fontWeight: {
      headline: 600,
      title: 600,
      body: 400,
    },
    lineHeight: {
      display: 1.2,
      headline: 1.3,
      title: 1.4,
      body: 1.5,
      small: 1.4,
    },
  },
  spacing: {
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 12px rgba(0, 0, 0, 0.4)',
    lg: '0 12px 24px rgba(0, 0, 0, 0.5)',
  },
  transitions: {
    fast: '80ms',
    quick: '120ms',
    normal: '200ms',
    slow: '300ms',
  },
};

// ============================================================================
// GLOBAL STYLES
// ============================================================================

export const globalStyles = css`
  * {
    box-sizing: border-box;
  }

  html, body {
    background-color: ${tipThemeEmotion.colors.surface.primary};
    color: ${tipThemeEmotion.colors.text.primary};
    font-family: ${tipThemeEmotion.typography.fontFamily.base};
    line-height: ${tipThemeEmotion.typography.lineHeight.body};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* Focus visible */
  :focus-visible {
    outline: 2px solid ${tipThemeEmotion.colors.accent.primary};
    outline-offset: 2px;
  }
`;

// ============================================================================
// STAT CARD (Emotion)
// ============================================================================

export const StatCardContainerEmotion = styled.div`
  padding: ${props => props.theme.spacing.md};
  background: ${props => props.theme.colors.surface.secondary};
  border: 1px solid ${props => props.theme.colors.border.light};
  border-radius: ${props => props.theme.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.sm};
  transition: all ${props => props.theme.transitions.quick} cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;

  &:hover {
    background: ${props => props.theme.colors.surface.tertiary};
    border-color: ${props => props.theme.colors.accent.primary};
    box-shadow: 0 0 0 1px ${props => props.theme.colors.border.default},
                0 4px 8px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: scale(0.98);
    box-shadow: inset 0 0 0 1px ${props => props.theme.colors.accent.primary};
  }
`;

export const StatCardLabelEmotion = styled.div`
  font-size: ${props => props.theme.typography.fontSize.small};
  font-weight: 600;
  color: ${props => props.theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const StatCardValueEmotion = styled.div`
  font-size: 32px;
  font-weight: 600;
  line-height: 1.2;
  font-family: ${props => props.theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  color: ${props => {
    if (props.severity === 'allow') return props.theme.colors.semantic.success;
    if (props.severity === 'warn') return props.theme.colors.semantic.warning;
    if (props.severity === 'block') return props.theme.colors.semantic.danger;
    return props.theme.colors.accent.primary;
  }};
`;

export const StatCardMetaEmotion = styled.div`
  font-size: ${props => props.theme.typography.fontSize.small};
  color: ${props => props.theme.colors.text.secondary};
  line-height: 1.4;
`;

// ============================================================================
// DATA TABLE (Emotion)
// ============================================================================

export const TableEmotion = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: ${props => props.theme.colors.surface.secondary};
  border-radius: ${props => props.theme.radius.md};
  overflow: hidden;
`;

export const TableHeadEmotion = styled.thead`
  background: rgba(88, 166, 255, 0.08);
  border-bottom: 1px solid ${props => props.theme.colors.border.default};
`;

export const TableHeaderCellEmotion = styled.th`
  padding: ${props => props.theme.spacing.md};
  font-size: ${props => props.theme.typography.fontSize.small};
  font-weight: 600;
  color: ${props => props.theme.colors.text.secondary};
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const TableBodyRowEmotion = styled.tr`
  border-bottom: 1px solid ${props => props.theme.colors.border.divider};
  transition: background ${props => props.theme.transitions.quick} cubic-bezier(0.16, 1, 0.3, 1);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${props => props.theme.colors.surface.hover};
    cursor: pointer;
  }

  &:active {
    background: rgba(88, 166, 255, 0.1);
  }
`;

export const TableCellEmotion = styled.td`
  padding: 14px ${props => props.theme.spacing.md};
  font-size: ${props => props.theme.typography.fontSize.body};
  color: ${props => props.theme.colors.text.primary};
  vertical-align: middle;
  ${props => props.mono && css`
    font-family: ${props.theme.typography.fontFamily.mono};
    font-size: ${props.theme.typography.fontSize.small};
    color: ${props.theme.colors.text.secondary};
    font-variant-numeric: tabular-nums;
  `}
`;

export const SeverityBadgeEmotion = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
  font-weight: 600;
  font-size: ${props => props.theme.typography.fontSize.small};
  padding: 2px 8px;
  border-radius: ${props => props.theme.radius.md};

  ${props => {
    switch (props.level) {
      case 'critical':
        return css`
          color: ${props.theme.colors.semantic.danger};
          background: rgba(248, 81, 73, 0.1);
        `;
      case 'high':
        return css`
          color: ${props.theme.colors.semantic.warning};
          background: rgba(210, 153, 34, 0.1);
        `;
      case 'medium':
        return css`
          color: #d0883c;
          background: rgba(208, 136, 60, 0.1);
        `;
      case 'low':
        return css`
          color: ${props.theme.colors.semantic.success};
          background: rgba(63, 185, 80, 0.1);
        `;
      default:
        return '';
    }
  }}
`;

// ============================================================================
// CHART CONTAINER (Emotion)
// ============================================================================

export const ChartContainerEmotion = styled.div`
  padding: ${props => props.theme.spacing.lg};
  background: ${props => props.theme.colors.surface.secondary};
  border: 1px solid ${props => props.theme.colors.border.light};
  border-radius: ${props => props.theme.radius.md};
  min-height: 300px;
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.md};
`;

export const ChartTitleEmotion = styled.h3`
  font-size: ${props => props.theme.typography.fontSize.title};
  font-weight: 600;
  color: ${props => props.theme.colors.text.primary};
  margin: 0;
`;

export const ChartLegendEmotion = styled.div`
  display: flex;
  gap: ${props => props.theme.spacing.lg};
  flex-wrap: wrap;
  font-size: ${props => props.theme.typography.fontSize.small};
`;

export const ChartLegendItemEmotion = styled.div`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.xs};
  cursor: pointer;
  transition: opacity ${props => props.theme.transitions.quick} cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    opacity: 0.8;
  }
`;

export const ChartLegendDotEmotion = styled.div`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: ${props => props.color};
`;

export const ChartCanvasEmotion = styled.div`
  flex: 1;
  background: rgba(0, 0, 0, 0.1);
  border-radius: ${props => props.theme.radius.md};
  padding: ${props => props.theme.spacing.md};
`;

// ============================================================================
// ACTIVITY ITEM (Emotion)
// ============================================================================

export const ActivityItemEmotion = styled.div`
  padding: ${props => props.theme.spacing.md};
  border-bottom: 1px solid ${props => props.theme.colors.border.divider};
  display: flex;
  gap: ${props => props.theme.spacing.md};
  align-items: flex-start;
  transition: background ${props => props.theme.transitions.quick} cubic-bezier(0.16, 1, 0.3, 1);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${props => props.theme.colors.surface.hover};
    cursor: pointer;
  }
`;

export const ActivityIconEmotion = styled.div`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: white;
  background-color: ${props => {
    switch (props.type) {
      case 'allow': return props.theme.colors.semantic.success;
      case 'warn': return props.theme.colors.semantic.warning;
      case 'block': return props.theme.colors.semantic.danger;
      default: return props.theme.colors.accent.primary;
    }
  }};
`;

export const ActivityContentEmotion = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const ActivityTitleEmotion = styled.div`
  font-size: ${props => props.theme.typography.fontSize.body};
  font-weight: 500;
  color: ${props => props.theme.colors.text.primary};
`;

export const ActivityDescriptionEmotion = styled.div`
  font-size: ${props => props.theme.typography.fontSize.small};
  color: ${props => props.theme.colors.text.secondary};
`;

export const ActivityIdEmotion = styled.div`
  font-family: ${props => props.theme.typography.fontFamily.mono};
  font-size: ${props => props.theme.typography.fontSize.small};
  color: ${props => props.theme.colors.text.tertiary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
`;

export const ActivityTimestampEmotion = styled.div`
  font-size: ${props => props.theme.typography.fontSize.small};
  color: ${props => props.theme.colors.text.tertiary};
  white-space: nowrap;
  flex-shrink: 0;
`;

// ============================================================================
// BUTTON (Emotion)
// ============================================================================

export const ButtonEmotion = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.theme.spacing.xs};

  padding: 8px 16px;
  font-size: ${props => props.theme.typography.fontSize.body};
  font-weight: 500;
  border: none;
  border-radius: ${props => props.theme.radius.md};
  cursor: pointer;

  transition: all ${props => props.theme.transitions.quick} cubic-bezier(0.16, 1, 0.3, 1);
  min-height: 44px;
  min-width: 44px;

  touch-action: manipulation;

  &:focus-visible {
    outline: 2px solid ${props => props.theme.colors.accent.primary};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  ${props => {
    if (props.variant === 'primary') {
      return css`
        background: ${props.theme.colors.accent.primary};
        color: ${props.theme.colors.surface.primary};

        &:hover:not(:disabled) {
          background: ${props.theme.colors.accent.hover};
          box-shadow: 0 0 0 1px ${props.theme.colors.border.default}, 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        &:active:not(:disabled) {
          transform: scale(0.98) translateY(1px);
        }
      `;
    } else if (props.variant === 'secondary') {
      return css`
        background: transparent;
        color: ${props.theme.colors.accent.primary};
        border: 1px solid ${props.theme.colors.accent.primary};

        &:hover:not(:disabled) {
          background: rgba(88, 166, 255, 0.1);
          border-color: ${props.theme.colors.accent.hover};
        }

        &:active:not(:disabled) {
          transform: scale(0.98) translateY(1px);
        }
      `;
    } else if (props.variant === 'danger') {
      return css`
        background: ${props.theme.colors.semantic.danger};
        color: white;

        &:hover:not(:disabled) {
          background: #f0423a;
          box-shadow: 0 0 0 1px ${props.theme.colors.border.default}, 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        &:active:not(:disabled) {
          transform: scale(0.98) translateY(1px);
        }
      `;
    }
  }}
`;

// ============================================================================
// INPUT (Emotion)
// ============================================================================

export const InputEmotion = styled.input`
  width: 100%;
  padding: 8px 12px;
  font-size: ${props => props.theme.typography.fontSize.body};
  font-family: inherit;

  background: ${props => props.theme.colors.surface.secondary};
  border: 1px solid ${props => props.theme.colors.border.default};
  border-radius: ${props => props.theme.radius.md};

  color: ${props => props.theme.colors.text.primary};
  transition: all ${props => props.theme.transitions.quick} cubic-bezier(0.16, 1, 0.3, 1);

  min-height: 44px;

  &::placeholder {
    color: ${props => props.theme.colors.text.muted};
  }

  &:hover {
    border-color: ${props => props.theme.colors.border.default};
  }

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.accent.primary};
    box-shadow: inset 0 0 0 1px ${props => props.theme.colors.accent.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  ${props => props.error && css`
    border-color: ${props.theme.colors.semantic.danger};

    &:focus {
      box-shadow: inset 0 0 0 1px ${props.theme.colors.semantic.danger};
    }
  `}
`;

// ============================================================================
// MODAL (Emotion)
// ============================================================================

export const ModalScrimEmotion = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  animation: fadeIn ${props => props.theme.transitions.normal} ease-out;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

export const ModalDialogEmotion = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: ${props => props.theme.colors.surface.secondary};
  border: 1px solid ${props => props.theme.colors.border.light};
  border-radius: ${props => props.theme.radius.lg};
  z-index: 1001;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideIn ${props => props.theme.transitions.normal} cubic-bezier(0.16, 1, 0.3, 1);

  ${props => {
    if (props.size === 'sm') return css`width: 90%; max-width: 400px;`;
    if (props.size === 'lg') return css`width: 90%; max-width: 800px;`;
    return css`width: 90%; max-width: 600px;`;
  }}

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translate(-50%, -48%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }
`;

export const ModalHeaderEmotion = styled.div`
  padding: ${props => props.theme.spacing.lg};
  border-bottom: 1px solid ${props => props.theme.colors.border.divider};
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

export const ModalTitleEmotion = styled.h2`
  font-size: ${props => props.theme.typography.fontSize.headline};
  font-weight: 600;
  color: ${props => props.theme.colors.text.primary};
  margin: 0 0 ${props => props.theme.spacing.xs} 0;
`;

export const ModalContentEmotion = styled.div`
  padding: ${props => props.theme.spacing.lg};
  color: ${props => props.theme.colors.text.primary};
`;

export const ModalFooterEmotion = styled.div`
  padding: ${props => props.theme.spacing.lg};
  border-top: 1px solid ${props => props.theme.colors.border.divider};
  display: flex;
  gap: ${props => props.theme.spacing.md};
  justify-content: flex-end;
`;

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  tipThemeEmotion,
  globalStyles,
  StatCardContainerEmotion,
  StatCardLabelEmotion,
  StatCardValueEmotion,
  StatCardMetaEmotion,
  TableEmotion,
  TableHeadEmotion,
  TableHeaderCellEmotion,
  TableBodyRowEmotion,
  TableCellEmotion,
  SeverityBadgeEmotion,
  ChartContainerEmotion,
  ChartTitleEmotion,
  ChartLegendEmotion,
  ChartLegendItemEmotion,
  ChartLegendDotEmotion,
  ChartCanvasEmotion,
  ActivityItemEmotion,
  ActivityIconEmotion,
  ActivityContentEmotion,
  ActivityTitleEmotion,
  ActivityDescriptionEmotion,
  ActivityIdEmotion,
  ActivityTimestampEmotion,
  ButtonEmotion,
  InputEmotion,
  ModalScrimEmotion,
  ModalDialogEmotion,
  ModalHeaderEmotion,
  ModalTitleEmotion,
  ModalContentEmotion,
  ModalFooterEmotion,
};
