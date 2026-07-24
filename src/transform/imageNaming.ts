/**
 * 图片文件名构造：{doc_id最后一段}-{index}.{ext}，保证跨文档唯一。
 *
 * 微信文章 media_id 前缀（wechatarticle_+固定 hash）对所有文章相同，
 * 取前 N 位会导致不同文档的图片同名（如全是 wechatar-1.png）。
 * 取最后一段作为唯一标识（笔记 docid 无下划线，最后一段即本身）。
 */
export function buildImageFilename(docId: string, index: number, ext: string): string {
  const docSuffix = docId.split("_").pop() ?? docId;
  return `${docSuffix}-${index}.${ext}`;
}
