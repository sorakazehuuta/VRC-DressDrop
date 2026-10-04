#if UDONSHARP
using UdonSharp;
using UnityEngine;

namespace VRPrintLab
{
    // pivot を一定の速さで回し続ける（各自の画面で同じ速さで回るため同期は不要）
    [UdonBehaviourSyncMode(BehaviourSyncMode.None)]
    public class VRPLSpin : UdonSharpBehaviour
    {
        public Transform pivot;
        public float speed = 45f;
        public int axis = 1; // 0: X, 1: Y, 2: Z

        private void Update()
        {
            if (pivot == null) return;
            Vector3 a = axis == 0 ? Vector3.right : (axis == 2 ? Vector3.forward : Vector3.up);
            pivot.Rotate(a, speed * Time.deltaTime, Space.Self);
        }
    }
}
#endif
