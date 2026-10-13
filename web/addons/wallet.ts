import UniversalProvider from "@walletconnect/universal-provider";
import QRCode from "qrcode";
export { UniversalProvider };
export const qrImage = (uri: string) =>
  QRCode.toDataURL(uri, {
    width: 288,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#11130f", light: "#ffffff" },
  });
