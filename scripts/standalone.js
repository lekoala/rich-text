import { defineRichText } from "../src/index.js";
import styles from "../src/rich-text.css";

const STYLE_ID = "lekoala-rich-text-style";

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  const nonce = document.currentScript?.nonce;
  if (nonce) style.nonce = nonce;
  document.head.append(style);
}

defineRichText();
