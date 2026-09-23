# PlanB — контент-план

Личный планировщик публикаций (пост / клип / сторис) для VK и Instagram.

**Онлайн:** https://dolinsv.github.io/PlanB/

## Важно (важно)

На GitHub Pages **нет сервера** — данные **не пишутся** в `data/store.json` репозитория.

| Режим | Где данные | Видны с других устройств |
|--------|------------|---------------------------|
| GitHub Pages без Firebase | только браузер (`localStorage`) | нет |
| GitHub Pages + Firebase | облако Firebase + кэш в браузере | да, в реальном времени |
| Локально `npm run dev:server` | `data/store.json` на ПК | да, если один общий сервер |

## Синхронизация между устройствами (Firebase)

1. Откройте https://console.firebase.google.com/ → создайте проект  
2. Добавьте приложение **Web**, скопируйте конфиг  
3. **Build → Realtime Database → Create** → режим test (или rules ниже)  
4. Впишите значения в `client/firebaseConfig.js`  
5. `npm run deploy`

Правила Realtime Database (для двоих достаточно):

```json
{
  "rules": {
    "planb": {
      ".read": true,
      ".write": true
    }
  }
}
```

После этого изменения у одного пользователя сразу появляются у остальных.

## Локально

```bash
npm install
npm run dev:server
npm run dev:client
```

http://localhost:5173 — общий `data/store.json`, автообновление каждые 4 сек.

## Публикация на GitHub Pages

```bash
npm run deploy
```

Settings → Pages → branch `gh-pages` / root.
