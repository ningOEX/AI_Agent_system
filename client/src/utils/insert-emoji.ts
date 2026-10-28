import { nextTick } from 'vue';

/**
 * 在指定 textarea 的光标位置插入表情，并在插入后把光标移到表情之后。
 * 若文本框从未聚焦过（光标停在 0 且已有内容），则追加到末尾。
 *
 * 传入 update 回调而不是直接返回新值，是为了在 v-model 更新、DOM 重新渲染之后
 * 再恢复焦点与光标位置，否则受控组件重渲染会把光标顶到末尾。
 */
export async function insertEmojiAtCursor(
  inputId: string,
  current: string,
  emoji: string,
  update: (value: string) => void,
): Promise<void> {
  const el = document.getElementById(inputId) as HTMLTextAreaElement | null;
  if (!el) {
    update(`${current}${emoji}`);
    return;
  }

  let start = el.selectionStart ?? current.length;
  let end = el.selectionEnd ?? current.length;

  if (start === 0 && end === 0 && current.length > 0) {
    start = current.length;
    end = current.length;
  }

  update(`${current.slice(0, start)}${emoji}${current.slice(end)}`);

  await nextTick();
  el.focus();
  el.setSelectionRange(start + emoji.length, start + emoji.length);
}
