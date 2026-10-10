import type { Metadata } from "next";
import GroupCallRoom from "@/components/call/GroupCallRoom";

export const metadata: Metadata = {
  title: "Group call",
};

/**
 * The call for one group session. The room's id is the group chat's, which
 * is what lets firestore.rules check who may be in it against the chat's own
 * members — see the `groupCalls` block there. A pasted id from somebody
 * else's group shows "no such group": the chat itself is unreadable to them.
 */
export default async function GroupCallPage(props: PageProps<"/call/group/[chatId]">) {
  const { chatId } = await props.params;

  return (
    <div className="max-w-[860px] space-y-5">
      <GroupCallRoom chatId={chatId} />
    </div>
  );
}
