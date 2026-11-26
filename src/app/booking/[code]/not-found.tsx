import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function BookingNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-occupied/15 text-status-occupied">
          <SearchX className="h-7 w-7" />
        </div>
        <h1 className="mt-4 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
          Kode Booking Tidak Ditemukan
        </h1>
        <p className="mt-2 text-sm text-muted">
          Pastikan kode booking yang Anda masukkan sudah benar (contoh:{" "}
          <span className="font-semibold text-foreground">ONS-4829</span>), atau
          buat reservasi meja baru di beranda.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali ke Beranda Onesticx</span>
        </Link>
      </div>
    </div>
  );
}
