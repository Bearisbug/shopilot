"use client";

import { DownloadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * PDF 预览：点 children（触发按钮）打开 Dialog，内嵌浏览器自带的 PDF 阅读器（接口加 ?inline=1 按内嵌返回），底部带下载。
 * 浏览器不能内嵌 PDF 时（多数手机浏览器，navigator.pdfViewerEnabled 为 false）只给下载，免得 iframe 直接触发一次下载
 */
export function PdfPreview({ url, title, children }: { url: string; title: string; children: React.ReactNode }) {
  // 弹窗内容只在打开后于浏览器里渲染，服务端取 true 不会造成水合差异
  const [inline] = useState(() => typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className={cn("sm:max-w-4xl", inline && "flex h-[calc(100dvh-2rem)] flex-col")}
        // 打开时聚焦「下载 PDF」而不是 iframe：焦点进了浏览器的 PDF 阅读器，Esc 就关不掉弹窗
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          downloadRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="tabular-nums">{title}</DialogTitle>
          <DialogDescription className={cn(inline && "sr-only")}>{inline ? "PDF 预览" : "这个浏览器不能直接预览 PDF，请下载后查看。"}</DialogDescription>
        </DialogHeader>
        {inline && <iframe src={`${url}?inline=1`} title={`${title} PDF 预览`} className="min-h-0 w-full flex-1 rounded-md border border-border bg-muted" />}
        <DialogFooter>
          <Button asChild variant="outline">
            <a ref={downloadRef} href={url} download>
              <DownloadIcon />
              下载 PDF
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
