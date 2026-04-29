// ============================================
// EmptyState — 空状态共享组件
// ============================================

import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  description?: string;
}

export function EmptyState({ icon: Icon, message, description }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <Icon className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
      {description && (
        <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">{description}</p>
      )}
    </div>
  );
}
