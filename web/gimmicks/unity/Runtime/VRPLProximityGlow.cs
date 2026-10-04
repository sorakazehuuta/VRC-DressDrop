#if UDONSHARP
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace VRPrintLab
{
    // だれかの手（useHands）または体が distance 以内に来たら光らせる。
    // 全員の位置から各自の画面で判定するので、通信なしで全員に同じように見える
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class VRPLProximityGlow : UdonSharpBehaviour
    {
        public Renderer[] renderers;
        public Color glowColor = Color.white;
        public float intensity = 2f;
        public float distance = 2f;
        public bool useHands;
        public float fadeSpeed = 4f;

        private Material[] materials;
        private VRCPlayerApi[] players = new VRCPlayerApi[100];
        private float level;
        private float appliedLevel = -1f;
        private float nextCheck;
        private bool near;

        private void Start()
        {
            int count = 0;
            foreach (Renderer r in renderers) if (r != null) count += r.sharedMaterials.Length;
            materials = new Material[count];
            int i = 0;
            foreach (Renderer r in renderers)
            {
                if (r == null) continue;
                // 実体化したマテリアルを使い、ほかの作品と共有しているマテリアルを書き換えない
                foreach (Material m in r.materials)
                {
                    // 発光の設定が無効だと _EmissionColor を変えても光らないので、実行時にも有効にする
                    m.EnableKeyword("_EMISSION");
                    materials[i++] = m;
                }
            }
        }

        private void Update()
        {
            if (Time.time >= nextCheck)
            {
                nextCheck = Time.time + 0.1f;
                near = CheckNear();
            }
            level = Mathf.MoveTowards(level, near ? 1f : 0f, Time.deltaTime * fadeSpeed);
            if (Mathf.Approximately(level, appliedLevel)) return;
            appliedLevel = level;
            Color c = glowColor * (intensity * level);
            foreach (Material m in materials) if (m != null) m.SetColor("_EmissionColor", c);
        }

        private bool CheckNear()
        {
            if (renderers == null || renderers.Length == 0 || renderers[0] == null) return false;
            Bounds b = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) if (renderers[i] != null) b.Encapsulate(renderers[i].bounds);

            int count = VRCPlayerApi.GetPlayerCount();
            VRCPlayerApi.GetPlayers(players);
            for (int i = 0; i < count && i < players.Length; i++)
            {
                VRCPlayerApi p = players[i];
                if (!Utilities.IsValid(p)) continue;
                if (useHands)
                {
                    if (HandNear(b, p, true)) return true;
                    if (HandNear(b, p, false)) return true;
                    if (IsNear(b, p.GetBonePosition(HumanBodyBones.LeftIndexDistal))) return true;
                    if (IsNear(b, p.GetBonePosition(HumanBodyBones.RightIndexDistal))) return true;
                }
                else
                {
                    if (IsNear(b, p.GetPosition())) return true;
                    if (IsNear(b, p.GetTrackingData(VRCPlayerApi.TrackingDataType.Head).position)) return true;
                }
            }
            return false;
        }

        // 手のボーンか、手のトラッキング位置のどちらかが触れていれば触れたとみなす。
        // デスクトップの人（ClientSim を含む）はボーンの手が下に垂れていて届かないが、トラッキング位置は顔の前にあるので、近づけば触れられる
        private bool HandNear(Bounds b, VRCPlayerApi player, bool left)
        {
            if (IsNear(b, player.GetBonePosition(left ? HumanBodyBones.LeftHand : HumanBodyBones.RightHand))) return true;
            return IsNear(b, player.GetTrackingData(left ? VRCPlayerApi.TrackingDataType.LeftHand : VRCPlayerApi.TrackingDataType.RightHand).position);
        }

        private bool IsNear(Bounds b, Vector3 p)
        {
            // ボーンがない場合は (0,0,0) が返るので無視する
            if (p == Vector3.zero) return false;
            Vector3 min = b.min;
            Vector3 max = b.max;
            Vector3 closest = new Vector3(Mathf.Clamp(p.x, min.x, max.x), Mathf.Clamp(p.y, min.y, max.y), Mathf.Clamp(p.z, min.z, max.z));
            return (closest - p).sqrMagnitude <= distance * distance;
        }
    }
}
#endif
