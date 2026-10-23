import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 企业智能助手',
  description: '自然语言查询企业关联关系图谱',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
