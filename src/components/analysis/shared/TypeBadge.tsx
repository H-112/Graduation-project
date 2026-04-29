// ============================================
// TypeBadge — 题型标签共享组件
// ============================================

interface TypeBadgeProps {
  type: string;
}

const labelMap: Record<string, string> = {
  single_choice: "单选",
  multi_select_single_col: "多选",
  multi_select_column: "多选列",
  multi_select_columns: "多选列",
  likert: "量表",
  text: "文本",
  demographic: "人口学",
  unknown: "未知",
};

const colorMap: Record<string, string> = {
  single_choice: "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",
  multi_select_single_col: "bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400",
  multi_select_column: "bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400",
  multi_select_columns: "bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400",
  likert: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
  text: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400",
  demographic: "bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400",
  unknown: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
};

export function TypeBadge({ type }: TypeBadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
        colorMap[type] || colorMap.unknown
      }`}
    >
      {labelMap[type] || type}
    </span>
  );
}
