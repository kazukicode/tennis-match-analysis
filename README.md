# Court Notes

テニスのスコアと戦術を記録するブラウザーアプリです。

## 起動

```sh
npm install
npm run dev
```

本番ビルドは `npm run build`、静的チェックは `npm run lint` です。

## 機能

- 初期画面から新規作成またはJSONファイルを開く
- シングルス／ダブルス、選手名、半角数字のセット数、ゲーム数、タイブレーク、ノーアドを設定
- ラリーを取ったチームを入力し、選手行・セット列・ゲーム得点の形式でスコアを表示
- 戦術ボードで選手を移動し、色を選んで矢印や線を描画。ボールは任意で追加
- 試合をJSONに保存して再読込
- スコア表と同じ列構成でCSVに書き出し

## GitHub Pages

`main` へのpushで `.github/workflows/pages.yml` がビルドとデプロイを行います。GitHubリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。公開元を切り替えた後に反映されない場合は、**Actions → Deploy to GitHub Pages → Run workflow** から一度実行してください。

公開URL: https://kazukicode.github.io/tennis-match-analysis/
