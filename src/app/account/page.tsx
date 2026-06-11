"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeInfo,
  CalendarDays,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Save,
  ShieldAlert,
  Trash2,
  UserRound
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { ApiError, deleteMe, getMe } from "@/lib/api";
import {
  authTokenStorageKey,
  defaultProfilePreferences,
  readProfilePreferences,
  writeProfilePreferences,
  type ProfilePreferences
} from "@/lib/profile";

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function AccountPage() {
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<ProfilePreferences>(defaultProfilePreferences);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAccessToken(window.localStorage.getItem(authTokenStorageKey));
      setPreferences(readProfilePreferences());
    } catch {
      setAccessToken(null);
      setPreferences(defaultProfilePreferences);
    }
  }, []);

  const meQuery = useQuery({
    queryKey: ["account-me", accessToken],
    queryFn: () => getMe(accessToken as string),
    enabled: Boolean(accessToken),
    retry: false
  });

  const deleteMeMutation = useMutation({
    mutationFn: () => deleteMe(accessToken as string),
    onSuccess: () => {
      window.localStorage.removeItem(authTokenStorageKey);
      setAccessToken(null);
      queryClient.removeQueries({ queryKey: ["account-me"] });
    }
  });

  useEffect(() => {
    if (!(meQuery.error instanceof ApiError)) return;
    if (meQuery.error.status !== 401) return;
    window.localStorage.removeItem(authTokenStorageKey);
    setAccessToken(null);
    queryClient.removeQueries({ queryKey: ["account-me"] });
  }, [meQuery.error, queryClient]);

  function savePreferences() {
    writeProfilePreferences(preferences);
    setSavedMessage("로컬 워크스페이스 프로필이 저장되었습니다.");
    window.setTimeout(() => setSavedMessage(null), 2500);
  }

  function logout() {
    window.localStorage.removeItem(authTokenStorageKey);
    setAccessToken(null);
    queryClient.removeQueries({ queryKey: ["account-me"] });
  }

  const apiError =
    (meQuery.error as ApiError | null) || (deleteMeMutation.error as ApiError | null);
  const displayName = preferences.displayName.trim() || meQuery.data?.name || "사용자";

  return (
    <main className="min-h-screen bg-[#fafaf7] px-5 py-6 text-[#232521] lg:px-8">
      <div className="mx-auto max-w-[1360px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-3xl bg-[#f1f4eb] text-[#667d51]">
              <BadgeInfo className="h-7 w-7" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8c9288]">
                Account
              </p>
              <h1 className="mt-1 text-3xl font-semibold">회원 정보</h1>
              <p className="mt-1 text-sm text-[#70756d]">
                서버 계정 정보와 워크스페이스 표시 설정을 한 화면에서 관리합니다.
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="pressable-link inline-flex h-11 items-center gap-2 rounded-2xl border border-[#d9ddd4] bg-white px-4 text-sm text-[#4e544c]"
          >
            <ArrowLeft className="h-4 w-4" />
            워크스페이스로 돌아가기
          </Link>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[28px] border border-[#dfe2da] bg-white p-6 shadow-[0_18px_48px_rgba(37,38,34,0.06)]">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-[#ece9ff] text-base font-semibold text-[#7f6bff]">
                {displayName.slice(0, 1)}
              </div>
              <div>
                <p className="text-lg font-semibold">{displayName}</p>
                <p className="text-sm text-[#7a7f76]">
                  {preferences.roleLabel.trim() || "연구원"}
                </p>
              </div>
            </div>

            {!accessToken ? (
              <div className="rounded-2xl border border-[#e5e7e0] bg-[#fafaf7] px-5 py-5">
                <p className="text-base font-medium">로그인이 필요합니다.</p>
                <p className="mt-2 text-sm text-[#6f756d]">
                  홈 화면의 좌측 하단 회원 메뉴에서 로그인 후 다시 접근하세요.
                </p>
              </div>
            ) : meQuery.isLoading ? (
              <div className="inline-flex items-center gap-2 text-sm text-[#6f756d]">
                <Loader2 className="h-4 w-4 animate-spin" />
                계정 정보를 불러오는 중입니다.
              </div>
            ) : meQuery.data ? (
              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard icon={<UserRound className="h-4 w-4" />} label="이름" value={meQuery.data.name} />
                <InfoCard icon={<Mail className="h-4 w-4" />} label="이메일" value={meQuery.data.email} />
                <InfoCard
                  icon={<KeyRound className="h-4 w-4" />}
                  label="회원 ID"
                  value={meQuery.data.userId}
                />
                <InfoCard
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="가입 시각"
                  value={formatDate(meQuery.data.createdAt)}
                />
              </div>
            ) : null}

            {apiError ? (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#efc2b7] bg-[#fff3ef] px-4 py-3 text-sm text-[#8d382d]">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{apiError.message}</p>
              </div>
            ) : null}

            {accessToken ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#d9ddd4] bg-white px-4 text-sm text-[#495047]"
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm("회원 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
                      return;
                    }
                    deleteMeMutation.mutate();
                  }}
                  disabled={deleteMeMutation.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#f0d0ca] bg-[#fff6f4] px-4 text-sm text-[#8a5b54] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleteMeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  회원 삭제
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-[#dfe2da] bg-white p-6 shadow-[0_18px_48px_rgba(37,38,34,0.06)]">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8c9288]">
                Workspace Profile
              </p>
              <h2 className="mt-2 text-2xl font-semibold">표시 정보 설정</h2>
              <p className="mt-1 text-sm text-[#70756d]">
                서버 회원 정보 수정 API가 아직 없으므로, 이 영역은 현재 브라우저에만 저장됩니다.
              </p>
            </div>

            <div className="space-y-4">
              <Field label="표시 이름">
                <input
                  value={preferences.displayName}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      displayName: event.target.value
                    }))
                  }
                  className="h-11 w-full rounded-2xl border border-[#d9ddd4] bg-white px-4 text-sm outline-none focus:border-[#7f9f67] focus:ring-2 focus:ring-[#d7ebc8]"
                  placeholder="화면에 보여줄 이름"
                />
              </Field>

              <Field label="역할 라벨">
                <input
                  value={preferences.roleLabel}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      roleLabel: event.target.value
                    }))
                  }
                  className="h-11 w-full rounded-2xl border border-[#d9ddd4] bg-white px-4 text-sm outline-none focus:border-[#7f9f67] focus:ring-2 focus:ring-[#d7ebc8]"
                  placeholder="예: 연구원, PM, 개발자"
                />
              </Field>

              <Field label="팀/워크스페이스 이름">
                <input
                  value={preferences.teamName}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      teamName: event.target.value
                    }))
                  }
                  className="h-11 w-full rounded-2xl border border-[#d9ddd4] bg-white px-4 text-sm outline-none focus:border-[#7f9f67] focus:ring-2 focus:ring-[#d7ebc8]"
                  placeholder="사이드바나 프로필 카드에서 쓸 이름"
                />
              </Field>

              <Field label="메모">
                <textarea
                  value={preferences.note}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      note: event.target.value
                    }))
                  }
                  rows={5}
                  className="w-full rounded-2xl border border-[#d9ddd4] bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#7f9f67] focus:ring-2 focus:ring-[#d7ebc8]"
                  placeholder="프로필과 관련된 로컬 메모를 남길 수 있습니다."
                />
              </Field>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="text-sm text-[#6f756d]">{savedMessage || "저장 시 현재 브라우저에 즉시 반영됩니다."}</div>
              <button
                type="button"
                onClick={savePreferences}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#273127] px-5 text-sm font-semibold text-white"
              >
                <Save className="h-4 w-4" />
                저장
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#454a43]">{label}</span>
      {children}
    </label>
  );
}

function InfoCard({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e5e7e0] bg-[#fafaf7] px-4 py-4">
      <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8c9288]">
        {icon}
        {label}
      </div>
      <p className="break-all text-sm font-medium text-[#232521]">{value}</p>
    </div>
  );
}
