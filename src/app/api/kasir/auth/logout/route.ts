import { NextResponse } from "next/server";
import { KASIR_COOKIE_NAME } from "@/lib/kasir-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: KASIR_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
