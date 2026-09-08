import LeavePolicyConfig from './LeavePolicyConfig';
import RegularizationPolicyConfig from './RegularizationPolicyConfig';
import AutoEndDayPolicyConfig from './AutoEndDayPolicyConfig';

const AttendancePolicyConfig = () => {
  return (
    <div className="space-y-6">
      <AutoEndDayPolicyConfig />
      <LeavePolicyConfig />
      <RegularizationPolicyConfig />
    </div>
  );
};

export default AttendancePolicyConfig;
