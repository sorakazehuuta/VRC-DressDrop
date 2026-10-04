#if UDONSHARP
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace VRPrintLab
{
    // 触るたびに 360°/steps ずつ回る（段階は全員に同期）
    [UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
    public class VRPLStepRotate : UdonSharpBehaviour
    {
        public Transform pivot;
        public int steps = 4;
        public int axis = 1; // 0: X, 1: Y, 2: Z
        public float smoothness = 8f;

        [UdonSynced] private int index;
        private Quaternion baseRotation;
        private float currentAngle;

        private void Start()
        {
            if (pivot != null) baseRotation = pivot.localRotation;
        }

        public override void Interact()
        {
            if (!Networking.IsOwner(gameObject)) Networking.SetOwner(Networking.LocalPlayer, gameObject);
            index = (index + 1) % Mathf.Max(2, steps);
            RequestSerialization();
        }

        private void Update()
        {
            if (pivot == null) return;
            float target = index * 360f / Mathf.Max(2, steps);
            // 最後の段階から最初に戻るときも、逆回転せず同じ向きに回る
            currentAngle += Mathf.DeltaAngle(currentAngle, target) * Mathf.Min(1f, Time.deltaTime * smoothness);
            Vector3 a = axis == 0 ? Vector3.right : (axis == 2 ? Vector3.forward : Vector3.up);
            pivot.localRotation = baseRotation * Quaternion.AngleAxis(currentAngle, a);
        }
    }
}
#endif
