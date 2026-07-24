"use client";

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  stickers: string[];
};

export function Composer({ value, onChange, onSend, onStop, isStreaming, stickers }: ComposerProps) {
  return (
    <div className="composer">
      <div className="sticker-row" aria-label="常用表情">
        {stickers.map((sticker) => (
          <button key={sticker} className="sticker-button" onClick={() => onChange(`${value}${sticker}`)} type="button">
            {sticker}
          </button>
        ))}
      </div>
      <textarea
        aria-label="输入消息"
        value={value}
        placeholder="问点什么…"
        rows={2}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (value.trim() && !isStreaming) onSend();
          }
        }}
      />
      <div className="composer-actions">
        <span>Enter 发送 · Shift + Enter 换行</span>
        {isStreaming ? (
          <button className="danger-button" onClick={onStop} type="button">停止生成</button>
        ) : (
          <button className="primary-button" disabled={!value.trim()} onClick={onSend} type="button">发送</button>
        )}
      </div>
    </div>
  );
}
