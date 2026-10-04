#if UDONSHARP
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace VRPrintLab
{
    // だれかの手が触れたら、触れた向きに押されたように揺れ、ばねのように元に戻る。
    // 全員の手の位置から各自の画面で判定するので通信は不要
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class VRPLTouchSway : UdonSharpBehaviour
    {
        public Transform pivot;
        public Renderer[] renderers;
        public float strength = 15f;
        public float distance = 0.1f;
        public float stiffness = 40f;
        public float damping = 4f;

        private VRCPlayerApi[] players = new VRCPlayerApi[100];
        private Quaternion baseRotation;
        private Vector3 swayAxis = Vector3.right;
        private Vector3 touchPoint;
        private float angle;
        private float velocity;
        private float nextCheck;
        private bool wasNear;

        private void Start()
        {
            if (pivot != null) baseRotation = pivot.localRotation;
        }

        private void Update()
        {
            if (pivot == null) return;
            if (Time.time >= nextCheck)
            {
                nextCheck = Time.time + 0.05f;
                bool near = FindTouch();
                if (near && !wasNear)
                {
                    Vector3 away = pivot.position - touchPoint;
                    away.y = 0f;
                    if (away.sqrMagnitude < 0.000001f) away = Vector3.forward;
                    // 触れた側から押されたように倒れる回転軸（ワールド座標）
                    swayAxis = Vector3.Cross(Vector3.up, away.normalized);
                    velocity += strength * 8f;
                }
                wasNear = near;
            }

            float acceleration = -stiffness * angle - damping * velocity;
            velocity += acceleration * Time.deltaTime;
            angle = Mathf.Clamp(angle + velocity * Time.deltaTime, -strength * 1.5f, strength * 1.5f);

            Vector3 localAxis = pivot.parent != null ? pivot.parent.InverseTransformDirection(swayAxis) : swayAxis;
            pivot.localRotation = Quaternion.AngleAxis(angle, localAxis) * baseRotation;
        }

        private bool FindTouch()
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
                if (HandNear(b, p, true)) return true;
                if (HandNear(b, p, false)) return true;
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
            if (p == Vector3.zero) return false;
            Vector3 min = b.min;
            Vector3 max = b.max;
            Vector3 closest = new Vector3(Mathf.Clamp(p.x, min.x, max.x), Mathf.Clamp(p.y, min.y, max.y), Mathf.Clamp(p.z, min.z, max.z));
            if ((closest - p).sqrMagnitude > distance * distance) return false;
            touchPoint = p;
            return true;
        }
    }
}
#endif
