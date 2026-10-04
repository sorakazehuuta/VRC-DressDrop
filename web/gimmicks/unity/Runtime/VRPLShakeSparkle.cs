#if UDONSHARP
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;
using VRC.Udon.Common.Interfaces;

namespace VRPrintLab
{
    // 持って振ると粒を飛ばす。持っている人の画面で振りを判定し、全員に「粒を出して」と送る
    // （SendCustomNetworkEvent は同期方式が None だと送れないので Manual にする。同期する変数はない）
    [UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
    public class VRPLShakeSparkle : UdonSharpBehaviour
    {
        public ParticleSystem particles;
        public float sensitivity = 5f; // 1〜10。大きいほど弱い振りでも反応する
        public int burstCount = 8;

        private bool held;
        private Vector3 lastPosition;
        private float nextSend;

        public override void OnPickup()
        {
            held = true;
            lastPosition = transform.position;
        }

        public override void OnDrop()
        {
            held = false;
        }

        private void Update()
        {
            if (!held) return;
            Vector3 position = transform.position;
            float speed = (position - lastPosition).magnitude / Mathf.Max(Time.deltaTime, 0.0001f);
            lastPosition = position;
            float threshold = Mathf.Lerp(4f, 0.8f, (Mathf.Clamp(sensitivity, 1f, 10f) - 1f) / 9f);
            if (speed > threshold && Time.time >= nextSend)
            {
                nextSend = Time.time + 0.15f;
                SendCustomNetworkEvent(NetworkEventTarget.All, nameof(Burst));
            }
        }

        public void Burst()
        {
            if (particles != null) particles.Emit(burstCount);
        }
    }
}
#endif
