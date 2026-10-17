// 出稿的回复语言（§12.8 reply_language）：按买家最近的文字消息判定，判不出时按店铺站点默认；只看书写与常用词，不调模型。
import { LANG_NAME } from "./translate";

export type ReplyLang = "th" | "vi" | "zh" | "en" | "ms" | "id" | "tl";

/** 站点默认语言，与工作台发送前翻译的默认目标一致（composer.tsx MARKET_LANG）；表外站点用英语 */
export const MARKET_LANG: Record<string, ReplyLang> = { MY: "ms", TH: "th", VN: "vi", ID: "id", PH: "en", SG: "en" };

const THAI = /[\u0e00-\u0e7f]/;
/** 越南语独有的字母：ă â đ ê ô ơ ư 与带下点、钩号的元音 */
const VIET = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

const words = (s: string) => new Set(s.split(" "));
const EN = words(
  "i i'm im you your my me we the is are was were be can could will would should please pls thanks thank how what when where why which who do does did dont don't have has had not no yes and or but for with this that it to of in on at from already still want need order item received sorry there any much many about get got send sent refund return change cancel ship shipping delivery arrive price",
);
/** 只说这些词的消息判不出语言（各站点买家都这么写），往前找更早的文字消息 */
const WEAK = words("ok okay oke okey hi hello hai yes no thanks thank you tq ty noted");
/** 站点本地的拉丁字母语言：马来语、印尼语、菲律宾语，与不带声调符号的越南语 */
const LOCAL: Record<string, { lang: ReplyLang; words: Set<string> }> = {
  MY: { lang: "ms", words: words("saya boleh tak tidak tiada ada sudah dah belum nak ke ini itu untuk dengan barang bila macam mana berapa terima kasih sebab pihak tuan puan kenapa bukan yang kami awak lagi apa kalau tapi pun juga akan sampai hantar bayar maaf gambar kena beli betul harga ya cik encik kat dekat sikit ni tu je nk sy dh blh tk xboleh ade ajar cara guna nanti baik semula dia") },
  ID: { lang: "id", words: words("saya bisa tidak gak nggak ga sudah udah belum mau kak kakak min gan apa ini itu untuk dengan barang kapan gimana bagaimana berapa terima kasih yang kami kirim dikirim pesanan tolong ya sih dong aja juga akan sampai bayar maaf beli") },
  PH: { lang: "tl", words: words("po ba ang ng mga naman sana paano kailan wala salamat opo ako ko mo ito yung lang pa na sa din rin kasi pero magkano meron pwede hindi oo nyo kayo ninyo ano saan bakit") },
  VN: { lang: "vi", words: words("ko khong k duoc dc minh ban cho nha roi chua giao hang don bao nhieu nao oi vay gi sp ak anh chi em voi cai nay sao biet lam") },
};

/** 一条文字消息的语言；判不出返回 null。拉丁字母的消息只在英语与该站点本地语言之间判，常用词多的一方胜，打平判不出 */
export function detectLanguage(text: string, market: string | null): ReplyLang | null {
  if (THAI.test(text)) return "th";
  // 汉字不少于 2 个、且不少于拉丁单词数算中文（「Tiny 3 能连 iPad 吗」）
  const han = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  if (han >= 2 && han >= (text.match(/[A-Za-z]+/g)?.length ?? 0)) return "zh";
  if (VIET.test(text)) return "vi";
  // 去掉附加符号再比对常用词：不带声调符号的越南语（cai nao）与带的写法（cái nào）都能命中
  const tokens = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").match(/[a-z']+/g) ?? [];
  if (tokens.length === 0 || tokens.every((t) => WEAK.has(t))) return null;
  const local = market ? LOCAL[market.toUpperCase()] : undefined;
  const en = tokens.filter((t) => EN.has(t)).length;
  const loc = local ? tokens.filter((t) => local.words.has(t)).length : 0;
  if (local && loc > en) return local.lang;
  if (en > loc) return "en";
  return null;
}

/** 给模型的回复语言名：买家文字消息从新到旧找第一条判得出的，都判不出用站点默认 */
export function replyLanguage(buyerTexts: string[], market: string | null): string {
  let lang: ReplyLang | null = null;
  for (const t of buyerTexts) {
    lang = detectLanguage(t, market);
    if (lang) break;
  }
  return LANG_NAME[lang ?? MARKET_LANG[market?.toUpperCase() ?? ""] ?? "en"];
}
