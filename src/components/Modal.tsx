/**
 * 通用模态对话框组件
 * 支持：ESC 关闭、点击外部关闭、标题栏、自定义 footer
 * 样式：基于 semantic tokens，适配亮色/暗色主题
 */
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export default function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleBackdropClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleBackdropClick);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleBackdropClick);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
      <div
        ref={modalRef}
        className={`bg-surface rounded-xl shadow-lg w-full ${sizeMap[size]} transform transition-all flex flex-col max-h-[90vh] border border-border`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-text">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-tertiary hover:text-text hover:bg-surface-muted transition-colors"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 overflow-y-auto text-text-secondary text-sm">
          {children}
        </div>

        {footer && (
          <div className="px-5 py-4 border-t border-border bg-surface-elevated rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
