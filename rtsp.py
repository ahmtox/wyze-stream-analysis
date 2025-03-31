import os

import cv2
import wyzecam

auth_info = wyzecam.login(os.environ["EMAIL"], os.environ["PASSWORD"])
account = wyzecam.get_user_info(auth_info)
camera = wyzecam.get_camera_list(auth_info)[0]

with wyzecam.WyzeIOTC() as wyze_iotc:
  with wyze_iotc.connect_and_auth(account, camera) as sess:
    for (frame, frame_info) in sess.recv_video_frame_ndarray():
      cv2.imshow("Video Feed", frame)
      cv2.waitKey(1)
