import { allFlags } from "@/config/flags";
import { savedFunders } from "@/lib/saved-queries";
import { SavedTable } from "./saved-table";

export async function SavedList() {
  const rows = await savedFunders();
  // Read after the request-time query (which calls connection()), so this is the request's date.
  const today = new Date().toISOString().slice(0, 10);
  return <SavedTable rows={rows} today={today} showPeople={allFlags().boardMembers} showDraft={allFlags().aiDraft} />;
}
