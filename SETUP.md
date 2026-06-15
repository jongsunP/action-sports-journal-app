# Action Sports Journal Setup

이 문서는 새 Mac에서 30분 안에 Action Sports Journal을 실행하기 위한 환경 감사와 체크리스트입니다.

## 1. 필수 설치 프로그램

현재 프로젝트는 Expo SDK 54 기반 iOS-first React Native 앱입니다.

필수:

- Git
- Node.js 22 LTS
- npm
- Xcode 및 Xcode Command Line Tools
- Homebrew
- Expo/EAS 계정 접근 권한
- iPhone 실기기 테스트용 Apple Developer 접근 권한

권장:

- Watchman: 현재 Mac에는 설치되어 있지 않습니다. Expo 개발 서버 안정성을 위해 새 Mac에는 설치를 권장합니다.
- CocoaPods: 현재 Mac에는 `pod`가 감지되지 않습니다. Expo managed workflow와 EAS cloud build만 쓰면 당장 필수는 아니지만, 로컬 native prebuild/ios 폴더 작업이 필요해지면 설치합니다.

설치 예:

```bash
xcode-select --install
brew install node@22 watchman
```

## 2. Node 버전

프로젝트 표준:

```text
node: 22.x LTS
npm: 10.x or newer
```

- `.nvmrc` 기준 Node 22 LTS를 사용합니다.
- 새 Mac에서는 `nvm install` 또는 Node 22 LTS 설치를 권장합니다.
- `node_modules`는 백업하지 말고 `npm install`로 재생성합니다.

확인 명령:

```bash
node -v
npm -v
```

## 3. npm 버전

프로젝트 기준 npm은 Node 22 LTS에 포함된 npm 10 이상입니다.

주의:

- EAS CLI를 `npx eas-cli@latest`로 동시에 여러 개 실행하면 npm 캐시 충돌이 날 수 있습니다.
- 문제가 나면 임시 캐시를 지정해서 실행합니다.

```bash
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas --version
```

## 4. Expo/EAS 환경

현재 Expo/React Native 버전:

```text
Expo: ~54.0.35
React Native: 0.81.5
React: 19.1.0
```

현재 확인된 EAS 상태:

```text
EAS CLI: eas-cli/20.1.0
Expo account: jspark88
Email: parksunl88@gmail.com
EAS project ID: f6e1a90a-62fb-4485-9434-ca92a756b8f4
iOS bundle ID: com.jongsunp.actionsportsjournal
Preview distribution: internal
```

Preview 환경변수:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://10.10.7.17:8787/api/analyze-session-video
```

주의:

- 위 IP는 당시 Mac의 LAN IP입니다. 새 Mac이나 새 Wi-Fi에서는 반드시 다시 바꿔야 합니다.
- Expo public env var는 빌드 시점에 앱에 박히므로, EAS preview 환경변수를 바꾸면 preview build를 다시 만들어야 합니다.

확인 명령:

```bash
npm install
npm run typecheck
npx expo install --check
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas whoami
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas env:list --environment preview
```

Preview build:

```bash
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas build --platform ios --profile preview
```

## 5. Apple Developer 연동 상태

현재 EAS 계정에서 보이는 Apple teams:

```text
Innovaid Co. (Company/Organization): L339A3KKLC
jongsun park (Individual): HLV49C2YQA
```

현재 내부 배포용 등록 iPhone:

```text
UDID: 00008101-000404943640001E
Name: iphone12 mini
Class: iPhone
Apple Team ID: L339A3KKLC
```

확인 명령:

```bash
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas device:list --apple-team-id L339A3KKLC
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas build:list --platform ios --limit 5
```

최근 iOS preview build는 `finished` 상태였고, 내부 배포 IPA가 생성된 이력이 있습니다.

## 6. `.env.local` 구조

현재 로컬에는 `.env.local`이 없습니다. 새 Mac에서는 `.env.example`을 복사해서 만듭니다.

```bash
cp .env.example .env.local
```

현재 구조:

```text
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=gpt-5.5
PORT=8787
MAX_VIDEO_MB=50
DAILY_ANALYSIS_LIMIT=3
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=3
OPENAI_MAX_OUTPUT_TOKENS=3200
OPENAI_REQUEST_TIMEOUT_MS=240000
OPENAI_VIDEO_FRAME_COUNT=18
OPENAI_VIDEO_FRAME_WIDTH=1536
OPENAI_REASONING_EFFORT=xhigh
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://YOUR_COMPUTER_LAN_IP:8787/api/analyze-session-video
```

새 Mac에서 LAN IP 확인:

```bash
ifconfig en0 | awk '/inet / {print $2}'
```

현재 감사 시점의 Mac LAN IP는 `192.168.45.204`였습니다. 과거 iPhone 테스트에 사용된 IP는 `10.10.7.17`이므로, 네트워크가 바뀐 상태입니다.

## 7. Gemini/OpenAI 키 관리

현재 dev-server는 Gemini를 앱-facing 분석 경로로 유지하고, OpenAI GPT-5.5
wakeboard benchmark를 별도 endpoint로 제공합니다.

규칙:

- `GEMINI_API_KEY`는 `.env.local`에만 둡니다.
- `OPENAI_API_KEY`는 `.env.local`에만 둡니다.
- Expo public env var에는 비밀 키를 절대 넣지 않습니다.
- 모바일 앱에는 OpenAI/Gemini 키를 절대 넣지 않습니다.
- `.env.local`, `.env`, API 키, 토큰은 Git에 커밋하지 않습니다.

현재 `.gitignore`는 `.env*.local`과 `.env`를 제외합니다.

## 8. gitignore 감사

현재 제외됨:

- `node_modules/`
- `.npm-cache/`
- `.expo/`
- `dist/`
- `web-build/`
- `expo-env.d.ts`
- `ios/`, `android/`
- `.env*.local`, `.env`
- `*.tsbuildinfo`
- `dev-artifacts/`
- `.DS_Store`
- `*.ipa`, `*.apk`, `*.aab`

감사 결과:

- 비밀 파일 제외는 적절합니다.
- OpenAI benchmark JSON 저장 폴더인 `dev-artifacts/`가 제외되어 있습니다.
- EAS/Expo 로컬 빌드 산출물 확장자도 제외했습니다.
- 현재 워킹트리에는 `.DS_Store`가 존재하지만 Git 추적 대상은 아닙니다.

## 9. 백업이 필요한 파일

GitHub에 이미 있는 것:

- 소스 코드
- `package-lock.json`
- Expo/EAS 설정
- 문서
- assets

별도 백업 또는 안전한 보관이 필요한 것:

- `.env.local`의 실제 API 키 값
- OpenAI API key
- Gemini API key가 다시 필요하다면 Gemini API key
- Expo 계정 로그인 정보
- Apple Developer 계정 로그인 정보와 2FA 접근 수단
- 테스트용 원본 웨이크보드 영상 파일
- 비교용 Gemini 결과 JSON 또는 텍스트
- `dev-artifacts/openai-benchmarks/` 아래의 OpenAI benchmark 결과 JSON

백업하지 않아도 되는 것:

- `node_modules/`
- `.expo/`
- `.npm-cache/`
- `ios/`, `android/` 생성 폴더
- EAS 빌드 산출물 IPA/APK/AAB

## 10. 신규 PC 실행 체크리스트

1. Xcode를 설치하고 한 번 실행해서 라이선스와 추가 컴포넌트를 완료합니다.

```bash
xcodebuild -version
xcode-select --install
```

2. Homebrew, Git, Node 22 LTS, Watchman을 준비합니다.

```bash
brew --version
git --version
nvm install
nvm use
node -v
npm -v
brew install watchman
```

3. 저장소를 클론합니다.

```bash
cd ~/repository
git clone https://github.com/jongsunP/action-sports-journal-app.git
cd action-sports-journal-app
```

4. 의존성을 설치하고 타입 검증을 실행합니다.

```bash
npm install
npm run typecheck
npx expo install --check
```

5. `.env.local`을 만듭니다.

```bash
cp .env.example .env.local
```

6. `.env.local`에 `GEMINI_API_KEY`, `OPENAI_API_KEY`, 현재 Mac LAN IP 기반 endpoint를 채웁니다.

```text
GEMINI_API_KEY=...
OPENAI_API_KEY=...
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://CURRENT_MAC_LAN_IP:8787/api/analyze-session-video
```

7. dev analysis server를 실행합니다.

```bash
npm run server:dev
```

8. Mac에서 health check를 확인합니다.

```bash
curl http://127.0.0.1:8787/health
```

기대값:

```json
{
  "ok": true,
  "primaryProvider": "gemini",
  "geminiConfigured": true,
  "openAiBenchmark": {
    "configured": true,
    "model": "gpt-5.5"
  }
}
```

9. iPhone Safari에서 같은 Wi-Fi의 Mac LAN IP로 `/health`를 엽니다.

```text
http://CURRENT_MAC_LAN_IP:8787/health
```

10. EAS 로그인을 확인합니다.

```bash
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas whoami
```

기대 계정:

```text
jspark88
parksunl88@gmail.com
```

11. EAS preview env를 현재 LAN IP로 업데이트합니다.

```bash
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas env:list --environment preview
```

필요하면 Expo dashboard 또는 EAS CLI에서:

```text
EXPO_PUBLIC_AI_ANALYSIS_ENDPOINT=http://CURRENT_MAC_LAN_IP:8787/api/analyze-session-video
```

12. 내부 배포 iPhone 등록을 확인합니다.

```bash
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas device:list --apple-team-id L339A3KKLC
```

13. preview build를 만듭니다.

```bash
npm --cache /private/tmp/asj-npm-cache exec --yes --package eas-cli@latest -- eas build --platform ios --profile preview
```

14. iPhone에 preview 앱을 설치하고 테스트합니다.

- standalone 앱을 엽니다.
- 웨이크보드 ActivityGroup을 선택합니다.
- Session을 추가합니다.
- 같은 비교용 웨이크보드 영상을 선택합니다.
- `AI 체크하기`를 누릅니다.
- 결과가 앱에 표시되는지 확인합니다.
- 서버가 저장한 JSON을 확인합니다.

```bash
ls dev-artifacts/openai-benchmarks
```

## 현재 감사 결론

- 로컬 코드와 `origin/master`는 동기화되어 있습니다.
- TypeScript 검증은 통과했습니다.
- Expo dependency check는 네트워크 비활성 상태에서 로컬 맵 기준으로 통과했습니다.
- EAS 계정, preview env, iOS preview build 이력, 내부 배포 iPhone 등록은 확인됐습니다.
- 현재 `.env.local`은 로컬 전용 파일입니다. 실제 Gemini 분석과 OpenAI benchmark 실행 전 `GEMINI_API_KEY`와 `OPENAI_API_KEY`를 채워야 합니다.
- 현재 EAS preview endpoint는 과거 IP `10.10.7.17`을 가리키고 있어 새 Mac/새 네트워크에서는 업데이트 후 재빌드가 필요합니다.
