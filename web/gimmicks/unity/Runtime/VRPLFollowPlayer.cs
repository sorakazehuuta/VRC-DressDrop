#if UDONSHARP
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace VRPrintLab
{
    // 触った人の肩のあたりについていく。もう一度触ると止まる。
    // 動かすのは持ち主（触った人）だけで、位置は VRC Object Sync で全員に同期する
    [UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
    public class VRPLFollowPlayer : UdonSharpBehaviour
    {
        public float distance = 1f;
        public float followSpeed = 3f;

        [UdonSynced] private int followPlayerId = -1;

        public override void Interact()
        {
            VRCPlayerApi local = Networking.LocalPlayer;
            if (!Networking.IsOwner(gameObject)) Networking.SetOwner(local, gameObject);
            followPlayerId = followPlayerId == local.playerId ? -1 : local.playerId;
            RequestSerialization();
        }

        public override void OnPlayerLeft(VRCPlayerApi player)
        {
            if (!Utilities.IsValid(player) || !Networking.IsOwner(gameObject)) return;
            if (player.playerId != followPlayerId) return;
            followPlayerId = -1;
            RequestSerialization();
        }

        private void Update()
        {
            if (followPlayerId < 0 || !Networking.IsOwner(gameObject)) return;
            VRCPlayerApi player = VRCPlayerApi.GetPlayerById(followPlayerId);
            if (!Utilities.IsValid(player))
            {
                followPlayerId = -1;
                RequestSerialization();
                return;
            }
            Quaternion facing = player.GetRotation();
            Vector3 target = player.GetPosition() + facing * new Vector3(0.6f * distance, 1.3f, -0.3f * distance);
            float t = 1f - Mathf.Exp(-followSpeed * Time.deltaTime);
            transform.position = Vector3.Lerp(transform.position, target, t);
            transform.rotation = Quaternion.Slerp(transform.rotation, facing, t);
        }
    }
}
#endif
