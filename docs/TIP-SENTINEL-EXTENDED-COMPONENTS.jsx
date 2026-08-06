/**
 * TIP Intelligence Dashboard — Extended Components
 * Additional UI components: Modals, Tooltips, Notifications, Drawers, etc.
 *
 * Requires: React, CSS from TIP-SENTINEL-DESIGN-SYSTEM.md
 */

import React, { useState, useRef, useEffect } from 'react';

// ============================================================================
// 1. MODAL / DIALOG COMPONENT
// ============================================================================

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',  // 'sm' | 'md' | 'lg'
  action,       // Primary action button config
  isDismissable = true
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'modal--sm',
    md: 'modal--md',
    lg: 'modal--lg'
  };

  return (
    <>
      {/* Scrim (Backdrop) */}
      <div
        className="modal__scrim"
        onClick={isDismissable ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        className={`modal ${sizeClasses[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
      >
        {/* Header */}
        <div className="modal__header">
          <div>
            {title && <h2 id="modal-title" className="modal__title">{title}</h2>}
            {subtitle && <p id="modal-description" className="modal__subtitle">{subtitle}</p>}
          </div>

          {isDismissable && (
            <button
              className="modal__close"
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="modal__content">
          {children}
        </div>

        {/* Footer */}
        {(footer || action) && (
          <div className="modal__footer">
            {footer || (
              <>
                <button
                  className="btn btn--secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className={`btn ${action?.variant ? `btn--${action.variant}` : 'btn--primary'}`}
                  onClick={action?.onClick}
                >
                  {action?.label || 'Confirm'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// 2. TOOLTIP COMPONENT
// ============================================================================

export function Tooltip({
  content,
  children,
  position = 'top',  // 'top' | 'bottom' | 'left' | 'right'
  delay = 200
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef(null);
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const offset = 8;

        let x = 0, y = 0;
        switch (position) {
          case 'top':
            x = rect.left + rect.width / 2;
            y = rect.top - offset;
            break;
          case 'bottom':
            x = rect.left + rect.width / 2;
            y = rect.bottom + offset;
            break;
          case 'left':
            x = rect.left - offset;
            y = rect.top + rect.height / 2;
            break;
          case 'right':
            x = rect.right + offset;
            y = rect.top + rect.height / 2;
            break;
          default: break;
        }

        setCoords({ x, y });
        setIsVisible(true);
      }
    }, delay);
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
      >
        {children}
      </span>

      {isVisible && (
        <div
          className={`tooltip tooltip--${position}`}
          style={{
            left: `${coords.x}px`,
            top: `${coords.y}px`,
          }}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </>
  );
}

// ============================================================================
// 3. TOAST / NOTIFICATION COMPONENT
// ============================================================================

export function Toast({
  type = 'info',  // 'info' | 'success' | 'warning' | 'error'
  title,
  message,
  action,
  duration = 4000,
  onClose,
  id
}) {
  useEffect(() => {
    if (duration) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const typeClass = `toast--${type}`;
  const iconMap = {
    info: 'ℹ️',
    success: '✓',
    warning: '⚠️',
    error: '✕'
  };

  return (
    <div
      className={`toast ${typeClass}`}
      role="alert"
      aria-live="polite"
      key={id}
    >
      <div className="toast__icon">
        {iconMap[type]}
      </div>

      <div className="toast__content">
        {title && <div className="toast__title">{title}</div>}
        {message && <div className="toast__message">{message}</div>}
      </div>

      {action && (
        <button
          className="toast__action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}

      <button
        className="toast__close"
        onClick={onClose}
        aria-label="Close notification"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer({ toasts }) {
  return (
    <div className="toast-container" aria-label="Notifications" role="region">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
}

// ============================================================================
// 4. DRAWER / SIDEBAR COMPONENT
// ============================================================================

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  position = 'right',  // 'left' | 'right'
  size = 'md',  // 'sm' | 'md' | 'lg'
  isDismissable = true
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'drawer--sm',
    md: 'drawer--md',
    lg: 'drawer--lg'
  };

  const positionClass = `drawer--${position}`;

  return (
    <>
      {/* Scrim */}
      <div
        className="drawer__scrim"
        onClick={isDismissable ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`drawer ${positionClass} ${sizeClasses[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Header */}
        <div className="drawer__header">
          {title && <h2 id="drawer-title" className="drawer__title">{title}</h2>}
          {isDismissable && (
            <button
              className="drawer__close"
              onClick={onClose}
              aria-label="Close drawer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="drawer__content">
          {children}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 5. TABS COMPONENT
// ============================================================================

export function Tabs({
  tabs,  // [{ id, label, content }]
  activeTabId,
  onTabChange
}) {
  return (
    <div className="tabs">
      <div className="tabs__nav" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tabs__nav-item ${activeTabId === tab.id ? 'tabs__nav-item--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            aria-selected={activeTabId === tab.id}
            aria-controls={`${tab.id}-panel`}
            id={`${tab.id}-tab`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tabs__content">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`${tab.id}-panel`}
            className={`tabs__panel ${activeTabId === tab.id ? 'tabs__panel--active' : ''}`}
            role="tabpanel"
            aria-labelledby={`${tab.id}-tab`}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 6. DROPDOWN / SELECT COMPONENT
// ============================================================================

export function Dropdown({
  label,
  value,
  onChange,
  options,  // [{ value, label, disabled }]
  disabled = false,
  error
}) {
  return (
    <div className="form__group">
      {label && <label className="form__label">{label}</label>}

      <select
        className={`input input--select ${error ? 'input--error' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
      >
        <option value="">Select an option</option>
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            disabled={opt.disabled}
          >
            {opt.label}
          </option>
        ))}
      </select>

      {error && <div className="form__error">{error}</div>}
    </div>
  );
}

// ============================================================================
// 7. BADGE COMPONENT
// ============================================================================

export function Badge({
  children,
  variant = 'primary',  // 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info'
  size = 'md',  // 'sm' | 'md' | 'lg'
  count  // For notification badges
}) {
  const variantClass = `badge--${variant}`;
  const sizeClass = `badge--${size}`;

  if (count !== undefined) {
    return (
      <span className={`badge ${variantClass} ${sizeClass}`}>
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  return (
    <span className={`badge ${variantClass} ${sizeClass}`}>
      {children}
    </span>
  );
}

// ============================================================================
// 8. PROGRESS BAR COMPONENT
// ============================================================================

export function ProgressBar({
  value,  // 0-100
  label,
  variant = 'primary',  // 'primary' | 'success' | 'warning' | 'danger'
  animated = false,
  striped = false
}) {
  const variantClass = `progress-bar__fill--${variant}`;
  const classNames = `progress-bar__fill ${variantClass} ${animated ? 'progress-bar__fill--animated' : ''} ${striped ? 'progress-bar__fill--striped' : ''}`;

  return (
    <div className="progress-bar">
      <div
        className={classNames}
        style={{ width: `${value}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      />
      {label && <span className="progress-bar__label">{label}</span>}
    </div>
  );
}

// ============================================================================
// 9. SPINNER / LOADING COMPONENT
// ============================================================================

export function Spinner({
  size = 'md',  // 'sm' | 'md' | 'lg'
  label = 'Loading',
  variant = 'primary'
}) {
  const sizeMap = {
    sm: '24px',
    md: '40px',
    lg: '64px'
  };

  return (
    <div className="spinner" role="status" aria-label={label}>
      <div
        className={`spinner__ring spinner__ring--${variant}`}
        style={{
          width: sizeMap[size],
          height: sizeMap[size]
        }}
      />
      {label && <p className="spinner__label">{label}</p>}
    </div>
  );
}

// ============================================================================
// 10. SKELETON LOADER COMPONENT
// ============================================================================

export function Skeleton({
  width = '100%',
  height = '24px',
  count = 1,
  circle = false
}) {
  const skeletons = Array.from({ length: count });

  return (
    <div className="skeleton-container">
      {skeletons.map((_, idx) => (
        <div
          key={idx}
          className={`skeleton ${circle ? 'skeleton--circle' : ''}`}
          style={{
            width: circle ? height : width,
            height,
            borderRadius: circle ? '50%' : '8px'
          }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// 11. ALERT / BANNER COMPONENT
// ============================================================================

export function Alert({
  type = 'info',  // 'info' | 'success' | 'warning' | 'error'
  title,
  message,
  action,
  onClose,
  closeable = true
}) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  const typeClass = `alert--${type}`;
  const iconMap = {
    info: 'ℹ️',
    success: '✓',
    warning: '⚠️',
    error: '✕'
  };

  return (
    <div
      className={`alert ${typeClass}`}
      role="alert"
      aria-live="polite"
    >
      <div className="alert__icon">
        {iconMap[type]}
      </div>

      <div className="alert__content">
        {title && <h4 className="alert__title">{title}</h4>}
        {message && <p className="alert__message">{message}</p>}
      </div>

      {action && (
        <button
          className="alert__action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}

      {closeable && (
        <button
          className="alert__close"
          onClick={handleClose}
          aria-label="Close alert"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ============================================================================
// 12. PAGINATION COMPONENT
// ============================================================================

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  maxVisiblePages = 5
}) {
  const getPageNumbers = () => {
    const pages = [];
    const halfVisible = Math.floor(maxVisiblePages / 2);

    let start = Math.max(1, currentPage - halfVisible);
    let end = Math.min(totalPages, start + maxVisiblePages - 1);

    if (end - start < maxVisiblePages - 1) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }

    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push('...');
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <button
        className="pagination__btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        ← Previous
      </button>

      <div className="pagination__numbers">
        {getPageNumbers().map((page, idx) => (
          <button
            key={idx}
            className={`pagination__page ${page === currentPage ? 'pagination__page--active' : ''}`}
            onClick={() => typeof page === 'number' && onPageChange(page)}
            disabled={page === '...'}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        ))}
      </div>

      <button
        className="pagination__btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        Next →
      </button>
    </div>
  );
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  Modal,
  Tooltip,
  Toast,
  ToastContainer,
  Drawer,
  Tabs,
  Dropdown,
  Badge,
  ProgressBar,
  Spinner,
  Skeleton,
  Alert,
  Pagination
};
