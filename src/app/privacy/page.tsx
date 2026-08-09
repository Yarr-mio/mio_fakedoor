import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "미오(MIO) 개인정보처리방침",
  description: "미오(MIO) 앱의 개인정보 수집·이용에 관한 안내입니다.",
  robots: { index: false },
};

/**
 * 미오(MIO) 앱 개인정보처리방침.
 * Google Play / App Store 심사 및 서비스 운영에 필요한 공개 문서.
 * 내용 변경 시 시행일과 버전을 함께 갱신할 것.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-ink-200">
      <h1 className="text-2xl font-bold text-ink-100">미오(MIO) 개인정보처리방침</h1>
      <p className="mt-2 text-sm text-ink-400">시행일: 2026년 8월 9일 · 버전 1.0 (비공개 베타)</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed">
        <p>
          폴라리스(이하 &ldquo;회사&rdquo;)는 미오(MIO) 서비스(이하 &ldquo;서비스&rdquo;) 제공을 위해 아래와 같이
          개인정보를 처리합니다. 회사는 개인정보 보호법 등 관련 법령을 준수하며, 이용자의 개인정보를
          안전하게 보호하기 위해 노력합니다.
        </p>

        <div>
          <h2 className="text-base font-bold text-ink-100">1. 수집하는 개인정보 항목</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>계정 정보</b> — 카카오 또는 Apple 계정 연동 시: 이메일 주소, 이름(닉네임). 온보딩 과정에서
              선택 입력: 취업 상태 등 맞춤 추천을 위한 답변.
            </li>
            <li>
              <b>정서 기록(민감정보)</b> — 감정 체크인 기록, AI 캐릭터와의 대화 내용, 심리테스트 응답,
              추천 행동 수행 기록. 이 항목은 서비스의 핵심 기능 제공을 위해 이용자의 별도 동의를 받아
              수집합니다.
            </li>
            <li>
              <b>기기 및 이용 정보</b> — 기기 식별자, 푸시 알림 토큰, 앱 버전, 서비스 이용 기록(화면 이동,
              기능 사용 이벤트).
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink-100">2. 개인정보의 이용 목적</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>회원 식별, 로그인 등 서비스 기본 기능 제공</li>
            <li>AI 캐릭터 대화, 감정 기록, 맞춤 추천 행동, 감정 리포트 등 핵심 기능 제공</li>
            <li>체크인 리마인더 등 푸시 알림 발송(동의한 경우)</li>
            <li>서비스 품질 개선 및 오류 분석(비식별 통계 활용)</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink-100">3. 처리 위탁 및 국외 이전</h2>
          <p className="mt-2">
            회사는 서비스 제공을 위해 아래 업체에 개인정보 처리를 위탁하며, 일부는 국외에서 처리됩니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <b>OpenAI (미국)</b> — AI 대화 응답 생성. 대화 내용이 API로 전송되며, 모델 학습에는 사용되지
              않는 설정을 적용합니다.
            </li>
            <li>
              <b>Amazon Web Services (대한민국 리전)</b> — 서버 및 데이터 보관.
            </li>
            <li>
              <b>Google(FCM) / Apple(APNs)</b> — 푸시 알림 전송.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink-100">4. 보유 및 파기</h2>
          <p className="mt-2">
            개인정보는 회원 탈퇴 시 지체 없이 파기합니다. 다만 관련 법령에 따라 보존이 필요한 정보는
            해당 법령이 정한 기간 동안 보관 후 파기합니다. 전자적 파일은 복구할 수 없는 방법으로
            삭제합니다.
          </p>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink-100">5. 이용자의 권리</h2>
          <p className="mt-2">
            이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있으며, 앱 내
            설정 또는 아래 연락처를 통해 요청할 수 있습니다. 회사는 지체 없이 필요한 조치를 합니다.
          </p>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink-100">6. 안전성 확보 조치</h2>
          <p className="mt-2">
            회사는 개인정보의 안전한 처리를 위해 전송 구간 암호화(TLS), 접근 권한 관리, 접근 통제 등
            기술적·관리적 보호조치를 시행합니다.
          </p>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink-100">7. 아동의 개인정보</h2>
          <p className="mt-2">
            서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 만 14세 미만 아동의 개인정보를 고의로
            수집하지 않습니다.
          </p>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink-100">8. 개인정보 보호책임자 및 문의</h2>
          <p className="mt-2">
            개인정보 보호책임자: 김종혁 (폴라리스)
            <br />
            문의: <a className="text-mio-400 underline" href="mailto:mio.official402@gmail.com">mio.official402@gmail.com</a>
          </p>
        </div>

        <div>
          <h2 className="text-base font-bold text-ink-100">9. 고지 의무</h2>
          <p className="mt-2">
            본 방침의 내용이 변경되는 경우 시행 7일 전부터 서비스 내 공지 또는 본 페이지를 통해
            고지합니다.
          </p>
        </div>

        <p className="text-xs text-ink-500">
          ※ 미오는 의료 서비스가 아닌 자기돌봄 지원 앱입니다. 심리적 위기 상황에서는 자살예방
          상담전화 1393, 정신건강 위기상담 1577-0199의 도움을 받아주세요.
        </p>
      </section>
    </main>
  );
}
