/** dom 层：由 src/main.ts 在第 2 步机械拆出（逻辑未改，只加了 import/export）。 */
export function el(parent: any, tag: string, value?: unknown, cls?: string | string[]): any {
  const node = parent.createEl(tag, { cls });
  if (value !== undefined) node.setText(String(value));
  return node;
}

/** 可预期的用户输入错误：调用方据此决定"只提示"还是写 console.error */
export type ExpectedError = Error & { expected?: boolean };

export function expectedError(message: string): ExpectedError {
  const error = new Error(message) as ExpectedError;
  error.expected = true;
  return error;
}
