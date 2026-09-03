# Build & Distribuição Multiplataforma

A versão web continua funcionando exatamente como antes. As instruções abaixo são para gerar pacotes nativos a partir do mesmo código.

> Os passos nativos exigem rodar localmente após `Export to Github` + `git pull`. O sandbox do Lovable só roda a versão web.

---

## 1. Web (sem mudanças)

```bash
npm install
npm run build       # gera /dist (mesmo build usado pelo Android e Desktop)
```

Deploy continua pelo botão **Publish** do Lovable.

---

## 2. Android (Capacitor)

Pré-requisitos: Android Studio + JDK 17.

```bash
npm install
npx cap add android         # apenas na primeira vez
npm run build
npx cap sync android
npx cap open android        # abre Android Studio
```

Dentro do Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

> O `capacitor.config.ts` aponta `server.url` para o preview do Lovable para permitir hot-reload durante o desenvolvimento. Para gerar a APK de produção que carrega os arquivos locais, comente o bloco `server` antes de rodar `npx cap sync`.

### Ícone e splash
- Coloque os ícones em `android/app/src/main/res/mipmap-*`
- Splash configurada em `capacitor.config.ts` (plugin `SplashScreen`)

---

## 3. Desktop (Electron)

Já existe `electron/main.cjs`. Para empacotar:

```bash
npm install --save-dev electron @electron/packager
npm run build

# Linux
npx @electron/packager . "DuarteDelivery" --platform=linux --arch=x64 \
  --out=electron-release --overwrite \
  --ignore='^/src' --ignore='^/public' --ignore='^/android' \
  --ignore='^/electron-release'

# Windows (.exe)
npx @electron/packager . "DuarteDelivery" --platform=win32 --arch=x64 \
  --out=electron-release --overwrite \
  --ignore='^/src' --ignore='^/public' --ignore='^/android' \
  --ignore='^/electron-release'

# macOS
npx @electron/packager . "DuarteDelivery" --platform=darwin --arch=universal \
  --out=electron-release --overwrite \
  --ignore='^/src' --ignore='^/public' --ignore='^/android' \
  --ignore='^/electron-release'
```

Para que o Electron carregue corretamente os assets do `file://`, o `vite.config.ts` foi ajustado com `base: "./"`. Isso não afeta a versão web publicada (servida na raiz).

Adicione em `package.json` (manualmente, opcional):
```json
"main": "electron/main.cjs",
"scripts": {
  "electron": "electron .",
  "electron:build": "vite build && electron ."
}
```

---

## Checklist por plataforma

- [x] Web: `npm run build` + Publish
- [ ] Android: `npx cap sync android` + Android Studio → APK
- [ ] Windows: `@electron/packager --platform=win32`
- [ ] Linux: `@electron/packager --platform=linux`
- [ ] macOS: `@electron/packager --platform=darwin`

Login, banco de dados, regras de negócio e autenticação permanecem inalterados — todas as plataformas consomem o mesmo backend Lovable Cloud.
